"""Offline tests for the statz.gg tier-list and hero-page parsers (Issue #215 / PRED-M4).

No prior Statz HTML fixture tests existed in tests/. These tests exercise the captured
13 Nov 2026 (Patch 1.18) statz.gg fixtures across all six app brackets plus one hero
build page, pre-1.18 layout compatibility, quoted/multi-class HTML variants, and every
integrity guard. Network access is blocked throughout.
"""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import time
import unittest
from unittest import mock
import urllib.request

import predecessor_meta as pm

ROOT = Path(__file__).resolve().parents[1]
STATZ_FIXTURES = ROOT / "tests" / "fixtures" / "statz"

EXPECTED_LIVE_ROWS = {
    "bronze": 78,
    "silver": 74,
    "gold": 74,
    "platinum": 75,
    "diamond": 94,
}
EXPECTED_118_OPTIONS = [
    ("bronze", "Bronze+"),
    ("silver", "Silver+"),
    ("gold", "Gold+"),
    ("platinum", "Platinum+"),
    ("diamond", "Diamond+"),
    ("master", "Master+"),
]


def _synthetic_tierlist_html(
    *,
    title="Predecessor Tier List - Patch 1.18 | Statz",
    heading="Predecessor Tier List for All Roles, Patch 1.18",
    toggle_label="Gold+",
    options=(("bronze", "Bronze+"), ("gold", "Gold+"), ("master", "Master+")),
    headers=("Rank", "Role", "Hero", "Tier", "Win Rate", "Pick Rate", "Matches"),
    rows_html=None,
    include_dropdown=True,
    include_table=True,
):
    if rows_html is None:
        rows_html = [
            """
            <tr class="stats-table-row">
                <td class="stats-table-data">1</td>
                <td class="stats-table-data">
                    <img class="stats-role-img" src=/images/predecessor/role-images/jungle.webp alt=Jungle />
                </td>
                <td class="stats-table-data">
                    <a class="hero-align-center" href=/predecessor/heroes/kaelen/build/jungle>
                        <img class="stats-hero-img" src=/images/predecessor/hero-image-data/Kaelen.webp alt="kaelen"_display_name />
                        Kaelen
                    </a>
                </td>
                <td class="stats-table-data tier-splus">S&#x2B;</td>
                <td class="stats-table-data">58.12%</td>
                <td class="stats-table-data">13.59%</td>
                <td class="stats-table-data">1,182</td>
            </tr>
            """
        ]
    dropdown_html = ""
    if include_dropdown:
        opt_links = "\n".join(
            f'<div class="rank-option"><a href=/predecessor/hero-tier-list/{seg}>{lbl}</a></div>'
            for seg, lbl in options
        )
        toggle_block = (
            f'<div id="rankDropdownToggle" class="rank-dropdown-toggle"><span>{toggle_label}</span></div>'
            if toggle_label is not None
            else ""
        )
        dropdown_html = f"""
        <div class="rank-dropdown">
            {toggle_block}
            <div class="rank-dropdown-menu" id="rankDropdownMenu">
                <div id="rankDropdownOptions">{opt_links}</div>
            </div>
        </div>
        """
    body_rows = "\n".join(rows_html)
    th_cells = "".join(f"<th>{h}</th>" for h in headers)
    table_html = (
        f'<table id="heroTable"><thead><tr>{th_cells}</tr></thead><tbody>{body_rows}</tbody></table>'
        if include_table
        else body_rows
    )
    return f"<html><head><title>{title}</title></head><body><h1>{heading}</h1>{dropdown_html}{table_html}</body></html>"


class StatzParserTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(
            urllib.request,
            "urlopen",
            side_effect=AssertionError("Statz parser tests must never make network requests"),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_captured_tierlists_parse_each_offered_published_bracket(self):
        for bracket, expected_count in EXPECTED_LIVE_ROWS.items():
            fixture_path = STATZ_FIXTURES / f"tierlist-{bracket}.html"
            html = fixture_path.read_text(encoding="utf-8")
            for parsed in (pm.statz_parse_tierlist(html, bracket), pm.statz_parse_tierlist(html)):
                self.assertEqual(parsed["patch"], "1.18", bracket)
                self.assertEqual(parsed["bracket_label"], bracket.capitalize() + "+", bracket)
                self.assertEqual(parsed["bracket_options"], EXPECTED_118_OPTIONS, bracket)
                rows = parsed["rows"]
                self.assertEqual(len(rows), expected_count, bracket)
                self.assertEqual([r["rank"] for r in rows], list(range(1, expected_count + 1)), bracket)
                self.assertEqual(len({(r["slug"], r["role"]) for r in rows}), expected_count, bracket)
                for row in rows:
                    self.assertIn(row["role"], pm.ROLES)
                    self.assertIn(row["tier"], pm.TIER_ORDER)
                    self.assertEqual(row["build_path"], f"/predecessor/heroes/{row['slug']}/build/{row['role']}")
                    self.assertTrue(row["display_name"])
                    self.assertTrue(row["image"] and row["image"].endswith(".webp"))
                    self.assertGreaterEqual(row["winRate"], 0.0)
                    self.assertLessEqual(row["winRate"], 100.0)
                    self.assertGreaterEqual(row["pickRate"], 0.0)
                    self.assertLessEqual(row["pickRate"], 100.0)
                    self.assertGreater(row["matches"], 0)

        bronze = pm.statz_parse_tierlist((STATZ_FIXTURES / "tierlist-bronze.html").read_text(encoding="utf-8"), "bronze")
        by_pair = {(r["slug"], r["role"]): r for r in bronze["rows"]}
        self.assertEqual(by_pair[("iggy-scorch", "offlane")]["display_name"], "Iggy & Scorch")
        self.assertEqual(by_pair[("kaelen", "support")]["tier"], "S+")

        # Live Master+ tier list captured 14 Nov 2026 (Split 6): verified Master+ header/dropdown/table shell with 0 rows
        # while statz.gg awaits Master+ sample size. Must report Master+ cleanly and never borrow Paragon or Diamond rows.
        master_html = (STATZ_FIXTURES / "tierlist-master.html").read_text(encoding="utf-8")
        for parsed_master in (pm.statz_parse_tierlist(master_html, "master"), pm.statz_parse_tierlist(master_html)):
            self.assertEqual(parsed_master["patch"], "1.18")
            self.assertEqual(parsed_master["bracket_label"], "Master+")
            self.assertEqual(parsed_master["bracket_options"], EXPECTED_118_OPTIONS)
            self.assertEqual(parsed_master["rows"], [])

        # Populated Master+ tier list rows always parse as Master+ and never relabel as Paragon+.
        populated_master = pm.statz_parse_tierlist(
            _synthetic_tierlist_html(toggle_label="Master+", options=EXPECTED_118_OPTIONS),
            "master",
        )
        self.assertEqual(populated_master["bracket_label"], "Master+")
        self.assertEqual(len(populated_master["rows"]), 1)
        self.assertEqual(populated_master["rows"][0]["slug"], "kaelen")

    def test_captured_paragon_tierlist_fails_loudly_without_neighbour_fallback(self):
        paragon_html = (STATZ_FIXTURES / "tierlist-paragon.html").read_text(encoding="utf-8")
        for call in (
            lambda: pm.statz_parse_tierlist(paragon_html),
            lambda: pm.statz_parse_tierlist(paragon_html, "paragon"),
        ):
            with self.assertRaises(pm.StatzParseError) as ctx:
                call()
            msg = str(ctx.exception)
            self.assertIn("paragon", msg)
            self.assertIn("no longer exists on statz.gg", msg)
            self.assertIn("master", msg)
            self.assertNotIn("0 rows parsed", msg)

        # Even if statz.gg ever redirected /paragon to Master+ or Diamond+ or Gold+, it must still fail loudly.
        diamond_html = (STATZ_FIXTURES / "tierlist-diamond.html").read_text(encoding="utf-8")
        master_html = diamond_html.replace("<span>Diamond+</span>", "<span>Master+</span>", 1)
        for neighbour_html in (diamond_html, master_html):
            with self.assertRaises(pm.StatzParseError) as ctx:
                pm.statz_parse_tierlist(neighbour_html, "paragon")
            self.assertIn("paragon", str(ctx.exception))
            self.assertIn("no longer exists on statz.gg", str(ctx.exception))

    def test_collect_bundle_offline_records_discontinued_status_for_paragon_and_master_never_borrows_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            fix = Path(tmp)
            data_dir = fix / "data"
            (fix / "tierlist.html").write_bytes((STATZ_FIXTURES / "tierlist-paragon.html").read_bytes())
            (fix / "omeda_heroes.json").write_text(
                json.dumps([{"id": 1, "slug": "kaelen", "display_name": "Kaelen", "roles": ["Jungle"], "abilities": [], "classes": []}]),
                encoding="utf-8",
            )
            (fix / "omeda_items.json").write_text("[]", encoding="utf-8")
            with mock.patch.object(pm, "GUIDANCE_PACKET_OVERRIDE", str(fix / "empty-guidance.json")), mock.patch.object(
                pm, "DATA_DIR", data_dir
            ), mock.patch.object(pm, "LATEST_BUNDLE", data_dir / "latest_bundle.json"):
                bundle = pm.collect_bundle({"bracket": "paragon", "concurrency": 1}, fixture_dir=fix)
            self.assertEqual(bundle["tier_list"], [])
            self.assertEqual(bundle["bracket"]["segment"], "paragon")
            self.assertEqual(bundle["bracket"]["label"], "Paragon+")
            self.assertTrue(pm.bundle_statz_discontinued(bundle))
            for skey in ("statz_tierlist", "statz_hero_pages"):
                self.assertEqual(bundle["sources"][skey]["status"], "discontinued")
                self.assertEqual(bundle["sources"][skey]["discontinued_after_patch"], "1.18")
                self.assertIsNone(bundle["sources"][skey]["error"])
            statz_notices = [e for e in bundle["errors"] if e["source"] == "statz.gg tier list"]
            self.assertEqual(len(statz_notices), 1)
            self.assertEqual(statz_notices[0]["severity"], "warning")
            self.assertIn("stopped publishing Paragon+ after Patch 1.18", statz_notices[0]["detail"])
            self.assertFalse(any(e["severity"] == "error" and "statz" in e["source"].lower() for e in bundle["errors"]))

            # Historical pre-discontinuation Paragon+ Statz bundle on disk keeps its original date and rows under 'discontinued'.
            data_dir.mkdir(parents=True, exist_ok=True)
            historical = {
                "schema": 3,
                "generated_at": "2026-10-20T12:05:00+00:00",
                "patch": "1.18",
                "bracket": {"segment": "paragon", "label": "Paragon+"},
                "tier_list": [{"slug": "kaelen", "role": "jungle", "tier": "A", "winRate": 54.0, "pickRate": 9.0, "matches": 140}],
                "heroes": {
                    "kaelen": {
                        "slug": "kaelen",
                        "display_name": "Kaelen",
                        "roles": {
                            "jungle": {
                                "status": "ok",
                                "tier": "A",
                                "winRate": 54.0,
                                "pickRate": 9.0,
                                "playedGames": 140,
                                "fetched_at": "2026-10-20T12:00:00+00:00",
                                "builds": [],
                            }
                        },
                    }
                },
                "items": {},
                "perks": {},
                "pairs": {},
                "sources": {
                    "statz_tierlist": {"status": "ok", "fetched_at": "2026-10-20T12:00:00+00:00"},
                    "statz_hero_pages": {"status": "ok", "fetched_at": "2026-10-20T12:00:00+00:00"},
                },
            }
            (data_dir / "last_successful_paragon.json").write_text(json.dumps(historical), encoding="utf-8")
            with mock.patch.object(pm, "GUIDANCE_PACKET_OVERRIDE", str(fix / "empty-guidance.json")), mock.patch.object(
                pm, "DATA_DIR", data_dir
            ), mock.patch.object(pm, "LATEST_BUNDLE", data_dir / "latest_bundle.json"):
                retained_paragon = pm.collect_bundle({"bracket": "paragon", "concurrency": 1}, fixture_dir=fix)
            self.assertEqual(retained_paragon["patch"], "1.18")
            self.assertEqual(len(retained_paragon["tier_list"]), 1)
            self.assertEqual(retained_paragon["sources"]["statz_tierlist"]["status"], "discontinued")
            self.assertEqual(retained_paragon["sources"]["statz_tierlist"]["fetched_at"], "2026-10-20T12:00:00+00:00")
            self.assertEqual(retained_paragon["sources"]["statz_hero_pages"]["status"], "discontinued")
            self.assertEqual(retained_paragon["sources"]["statz_hero_pages"]["fetched_at"], "2026-10-20T12:00:00+00:00")

            # Master+ with 0 Statz rows keeps Master+ identity and never borrows Paragon+ or Diamond+ Statz rows.
            (fix / "tierlist.html").write_bytes((STATZ_FIXTURES / "tierlist-master.html").read_bytes())
            with mock.patch.object(pm, "GUIDANCE_PACKET_OVERRIDE", str(fix / "empty-guidance.json")), mock.patch.object(
                pm, "DATA_DIR", data_dir
            ), mock.patch.object(pm, "LATEST_BUNDLE", data_dir / "latest_bundle.json"):
                master_bundle = pm.collect_bundle({"bracket": "master", "concurrency": 1}, fixture_dir=fix)
            self.assertEqual(master_bundle["bracket"]["segment"], "master")
            self.assertEqual(master_bundle["bracket"]["label"], "Master+")
            self.assertEqual(master_bundle["tier_list"], [])
            self.assertEqual(master_bundle["sources"]["statz_tierlist"]["status"], "failed")
            self.assertIn("0 rows", master_bundle["sources"]["statz_tierlist"]["error"])

    def test_captured_hero_build_page_parses_and_enforces_bracket_and_identity_guards(self):
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")
        parsed = pm.statz_parse_hero_page(hero_html, "kaelen", "jungle", "gold")
        self.assertEqual(parsed["patch"], "1.18")
        self.assertEqual(parsed["bracket_label"], "Gold+")
        self.assertEqual(parsed["laneStats"]["hero"], "kaelen")
        self.assertEqual(parsed["laneStats"]["lane"].lower(), "jungle")
        self.assertEqual(parsed["laneStats"]["ranked"], "Gold")
        self.assertEqual(parsed["laneStats"]["playedGames"], 1182)
        self.assertGreaterEqual(len(parsed["laneStats"]["builds_by_perk"]), 1)
        self.assertTrue(parsed["abilities"] and parsed["items"] and parsed["perks"] and parsed["heroes"])
        self.assertGreater(len(parsed["image_names"]["items"]), 0)

        with self.assertRaises(pm.StatzParseError) as ctx:
            pm.statz_parse_hero_page(hero_html, "kaelen", "jungle", "paragon")
        self.assertIn("paragon", str(ctx.exception))
        self.assertIn("no longer exists on statz.gg", str(ctx.exception))

        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_html, "kaelen", "jungle", "silver")
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_html.replace("<span>Gold+</span>", "<span>Silver+</span>", 1), "kaelen", "jungle")
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_html, "grux", "jungle", "gold")
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_html, "kaelen", "support", "gold")

        # Live Master+ hero build page captured 14 Nov 2026 (Split 6 Low Sample Size): verifies Master+ dropdown and
        # explicit null-laneStats error, and rejects Paragon+ or Gold+ requests.
        master_hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-master.html").read_text(encoding="utf-8")
        with self.assertRaisesRegex(pm.StatzParseError, "laneStats is null: no data"):
            pm.statz_parse_hero_page(master_hero_html, "kaelen", "jungle", "master")
        with self.assertRaisesRegex(pm.StatzParseError, "no longer exists on statz.gg"):
            pm.statz_parse_hero_page(master_hero_html, "kaelen", "jungle", "paragon")
        with self.assertRaisesRegex(pm.StatzParseError, "did not match requested 'gold'"):
            pm.statz_parse_hero_page(master_hero_html, "kaelen", "jungle", "gold")

        # Populated Master+ hero page parses cleanly as Master+ when laneStats is present.
        populated_master_hero = (
            hero_html.replace("<span>Gold+</span>", "<span>Master+</span>", 1)
            .replace('ranked:"Gold"', 'ranked:"Master"')
            .replace('"ranked":"Gold"', '"ranked":"Master"')
        )
        parsed_master_hero = pm.statz_parse_hero_page(populated_master_hero, "kaelen", "jungle", "master")
        self.assertEqual(parsed_master_hero["bracket_label"], "Master+")
        self.assertEqual(parsed_master_hero["laneStats"]["ranked"], "Master")

    def test_legacy_pre_118_paragon_layout_and_quoted_attribute_variants_parse(self):
        legacy_options = (
            ("bronze", "Bronze+"),
            ("silver", "Silver+"),
            ("gold", "Gold+"),
            ("platinum", "Platinum+"),
            ("diamond", "Diamond+"),
            ("paragon", "Paragon+"),
        )
        legacy_html = _synthetic_tierlist_html(
            title="Predecessor Tier List - Patch 1.17 | Statz",
            heading="Predecessor Tier List for All Roles, Patch 1.17",
            toggle_label="Paragon+",
            options=legacy_options,
        )
        parsed_legacy = pm.statz_parse_tierlist(legacy_html, "paragon")
        self.assertEqual(parsed_legacy["patch"], "1.17")
        self.assertEqual(parsed_legacy["bracket_label"], "Paragon+")
        self.assertEqual(parsed_legacy["rows"][0]["matches"], 1182)

        quoted_row = """
        <tr class="stats-table-row odd-row">
            <td class="stats-table-data stats-active">1</td>
            <td class="stats-table-data">
                <img class="stats-role-img" src="/images/predecessor/role-images/midlane.webp" alt="Midlane" />
            </td>
            <td class="stats-table-data">
                <a class="hero-align-center" href="/predecessor/heroes/lt-belica/build/midlane/gold">
                    <img class="stats-hero-img" src="/images/predecessor/hero-image-data/Lt.-Belica.webp" alt="Lt. Belica" />
                    Lt. Belica
                </a>
            </td>
            <td class="stats-table-data tier-a stats-active">A</td>
            <td class="stats-table-data">52.50%</td>
            <td class="stats-table-data">8.25%</td>
            <td class="stats-table-data">412</td>
        </tr>
        """
        quoted_html = _synthetic_tierlist_html(rows_html=[quoted_row]).replace(
            "href=/predecessor/hero-tier-list/gold>", 'href="/predecessor/hero-tier-list/gold" class="active">'
        )
        for parsed_quoted in (pm.statz_parse_tierlist(quoted_html), pm.statz_parse_tierlist(quoted_html, "gold")):
            self.assertEqual(len(parsed_quoted["rows"]), 1)
            self.assertEqual(
                parsed_quoted["rows"][0],
                {
                    "slug": "lt-belica",
                    "role": "midlane",
                    "build_path": "/predecessor/heroes/lt-belica/build/midlane",
                    "display_name": "Lt. Belica",
                    "image": "Lt.-Belica.webp",
                    "rank": 1,
                    "tier": "A",
                    "winRate": 52.5,
                    "pickRate": 8.25,
                    "matches": 412,
                },
            )

    def test_tierlist_guards_reject_invalid_pages_and_rows(self):
        # 1. Missing patch label
        with self.assertRaisesRegex(pm.StatzParseError, "no 'Patch X.Y' label"):
            pm.statz_parse_tierlist(
                _synthetic_tierlist_html(title="Predecessor Tier List", heading="No version here"),
                "gold",
            )

        # 2. Bracket identity mismatch (requested silver, page reports Gold+)
        with self.assertRaisesRegex(pm.StatzParseError, "did not match requested 'silver'"):
            pm.statz_parse_tierlist(
                _synthetic_tierlist_html(options=(("silver", "Silver+"), ("gold", "Gold+"))),
                "silver",
            )

        # 3. Bracket requested when page lacks any bracket label
        with self.assertRaisesRegex(pm.StatzParseError, "did not match requested 'gold'"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(include_dropdown=False), "gold")

        # 4. rankDropdownOptions present with 0 parseable option links
        broken_dropdown = _synthetic_tierlist_html(options=())
        with self.assertRaisesRegex(pm.StatzParseError, "0 bracket options parsed"):
            pm.statz_parse_tierlist(broken_dropdown, "gold")

        # 5. Offered bracket with intact empty tbody returns rows == [], while missing table or unparsed tbody fails closed
        empty_verified = pm.statz_parse_tierlist(_synthetic_tierlist_html(rows_html=[]), "gold")
        self.assertEqual(empty_verified["rows"], [])
        self.assertEqual(empty_verified["bracket_label"], "Gold+")
        with self.assertRaisesRegex(pm.StatzParseError, "missing #heroTable table"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(rows_html=[], include_table=False), "gold")
        with self.assertRaisesRegex(pm.StatzParseError, "unexpected <div> inside <tbody>"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(rows_html=['<div class="changed">row</div>']), "gold")

        # 6. Malformed row (< 7 cells, or extra 8th column such as Ban Rate, or changed thead headers)
        short_row = '<tr class="stats-table-row"><td class="stats-table-data">1</td><td class="stats-table-data">2</td></tr>'
        with self.assertRaisesRegex(pm.StatzParseError, "did not match the expected layout"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(rows_html=[short_row]), "gold")

        with self.assertRaisesRegex(pm.StatzParseError, "table headers did not match expected layout"):
            pm.statz_parse_tierlist(
                _synthetic_tierlist_html(headers=("Rank", "Role", "Hero", "Tier", "Win Rate", "Pick Rate", "Ban Rate", "Matches")),
                "gold",
            )

        eight_col_row = _synthetic_tierlist_html().replace(
            "<td class=\"stats-table-data\">1,182</td>",
            "<td class=\"stats-table-data\">4.20%</td><td class=\"stats-table-data\">1,182</td>",
        )
        with self.assertRaisesRegex(pm.StatzParseError, "did not match the expected layout"):
            pm.statz_parse_tierlist(eight_col_row, "gold")

        # 6b. Non-percentage value in winRate / pickRate cell
        missing_pct = _synthetic_tierlist_html().replace(">58.12%<", ">58.12<")
        with self.assertRaisesRegex(pm.StatzParseError, "numeric cell did not match expected layout"):
            pm.statz_parse_tierlist(missing_pct, "gold")

        # 7. Unexpected tier label
        bad_tier = _synthetic_tierlist_html().replace(">S&#x2B;<", ">Z<")
        with self.assertRaisesRegex(pm.StatzParseError, "unexpected tier label"):
            pm.statz_parse_tierlist(bad_tier, "gold")

        # 8. Role icon disagrees with build URL role
        mismatched_role = _synthetic_tierlist_html().replace("alt=Jungle", "alt=Carry")
        with self.assertRaisesRegex(pm.StatzParseError, "disagrees with build link role"):
            pm.statz_parse_tierlist(mismatched_role, "gold")

        # 9. Zero or negative matches
        for bad_matches in ("0", "-4"):
            zero_html = _synthetic_tierlist_html().replace(">1,182<", f">{bad_matches}<")
            with self.assertRaisesRegex(pm.StatzParseError, "zero or invalid matches"):
                pm.statz_parse_tierlist(zero_html, "gold")

        # 10. Out-of-range winRate / pickRate
        bad_wr = _synthetic_tierlist_html().replace(">58.12%<", ">101.5%<")
        with self.assertRaisesRegex(pm.StatzParseError, "winRate"):
            pm.statz_parse_tierlist(bad_wr, "gold")
        bad_pr = _synthetic_tierlist_html().replace(">13.59%<", ">-0.5%<")
        with self.assertRaisesRegex(pm.StatzParseError, "pickRate"):
            pm.statz_parse_tierlist(bad_pr, "gold")

        # 11. Duplicate (slug, role) rows
        single_row = _synthetic_tierlist_html()
        row_chunk = re.search(r'<tr class="stats-table-row">.*?</tr>', single_row, re.S).group(0)
        dup_html = _synthetic_tierlist_html(rows_html=[row_chunk, row_chunk.replace(">1<", ">2<", 1)])
        with self.assertRaisesRegex(pm.StatzParseError, "duplicate hero/role rows"):
            pm.statz_parse_tierlist(dup_html, "gold")

    def test_f1_multi_tbody_tables_parse_every_body_and_reject_unconsumed_content(self):
        gold_html = (STATZ_FIXTURES / "tierlist-gold.html").read_text(encoding="utf-8")
        expected = pm.statz_parse_tierlist(gold_html, "gold")
        self.assertEqual(len(expected["rows"]), 74)

        tbody_idx = gold_html.index("<tbody>")
        two_body_gold = gold_html[:tbody_idx] + gold_html[tbody_idx:].replace("</tr>", "</tr></tbody><tbody>", 1)
        for parsed in (pm.statz_parse_tierlist(two_body_gold, "gold"), pm.statz_parse_tierlist(two_body_gold)):
            self.assertEqual(len(parsed["rows"]), 74)
            self.assertEqual(parsed["rows"], expected["rows"])

        second_tbody_idx = two_body_gold.index("<tbody>", tbody_idx + len("<tbody>"))
        three_body_gold = (
            two_body_gold[:second_tbody_idx]
            + two_body_gold[second_tbody_idx:].replace("</tr>", "</tr></tbody><tbody>", 1)
        )
        self.assertEqual(pm.statz_parse_tierlist(three_body_gold, "gold")["rows"], expected["rows"])

        single_html = _synthetic_tierlist_html()
        valid_row = re.search(r'<tr class="stats-table-row">.*?</tr>', single_html, re.S).group(0)
        dup_second_body = single_html.replace(
            "</tbody>",
            f"</tbody><tbody>{valid_row.replace('>1<', '>2<', 1)}</tbody>",
            1,
        )
        with self.assertRaisesRegex(pm.StatzParseError, "duplicate hero/role rows"):
            pm.statz_parse_tierlist(dup_second_body, "gold")

        bad_second_body = single_html.replace(
            "</tbody>",
            '</tbody><tbody><tr class="stats-table-row"><td class="stats-table-data">2</td></tr></tbody>',
            1,
        )
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_tierlist(bad_second_body, "gold")

        empty_second_body = single_html.replace("</tbody>", "</tbody><tbody></tbody>", 1)
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_tierlist(empty_second_body, "gold")

        # Unconsumed row/cell content cases that must fail loudly instead of silently dropping content
        unconsumed_cases = [
            # Unterminated second <tr> inside <tbody>
            single_html.replace("</tbody>", '<tr class="stats-table-row"><td class="stats-table-data">2</td></tbody>', 1),
            # Stray <td> inside <tbody> after a valid row
            single_html.replace("</tbody>", '<td class="stats-table-data">999</td></tbody>', 1),
            # Stray text inside <tbody> outside <tr>
            single_html.replace("</tbody>", "unconsumed row text</tbody>", 1),
            # Unterminated 8th <td> inside <tr>
            single_html.replace("</tr>\n            \n</tbody>", '<td class="stats-table-data">extra</tr></tbody>', 1)
            if "</tr>\n            \n</tbody>" in single_html
            else re.sub(r"</tr>(\s*</tbody>)", r'<td class="stats-table-data">extra</tr>\1', single_html, count=1),
            # Stray text inside <tr> outside <td>
            re.sub(r"</tr>(\s*</tbody>)", r"stray cell text</tr>\1", single_html, count=1),
            # Extra text outside <a> inside the hero <td>
            single_html.replace("</a>", "</a> stray hero text", 1),
            # Premature </table> leaving trailing rows unconsumed outside #heroTable
            two_body_gold.replace("</tbody><tbody>", "</tbody></table><tbody>", 1),
            # Row without stats-table-row class inside <tbody>
            single_html.replace(
                "</tbody>",
                '<tr><td class="stats-table-data">2</td></tr></tbody>',
                1,
            ),
        ]
        for bad_html in unconsumed_cases:
            with self.assertRaises(pm.StatzParseError):
                pm.statz_parse_tierlist(bad_html, "gold")

    def test_f2_adversarial_malformed_html_finishes_in_bounded_linear_time(self):
        gold_html = (STATZ_FIXTURES / "tierlist-gold.html").read_text(encoding="utf-8")
        prefix = gold_html[: gold_html.index("<tbody>") + len("<tbody>")]

        adversarial_tierlists = [
            _synthetic_tierlist_html(include_table=False, rows_html=["<tr class=stats-table-row" + (" " * 64_000)]),
            _synthetic_tierlist_html(include_table=False, rows_html=["<tr class=stats-table-row" + (" " * 128_000)]),
            "<tr class=stats-table-row" + (" " * 262_144),
            _synthetic_tierlist_html(include_table=False, rows_html=['<tr class="stats-table-row' + (" " * 128_000)]),
            prefix + "<tr class=stats-table-row" + (" " * 128_000),
        ]
        t_batch = time.perf_counter()
        for payload in adversarial_tierlists:
            t0 = time.perf_counter()
            with self.assertRaises(pm.StatzParseError):
                pm.statz_parse_tierlist(payload, "gold")
            elapsed = time.perf_counter() - t0
            self.assertLess(elapsed, 0.25, f"Adversarial tier-list payload ({len(payload)} chars) took {elapsed:.3f}s")
        self.assertLess(time.perf_counter() - t_batch, 0.5)

        hero_adv = (
            '<html><body><div class="rank-dropdown"><div id="rankDropdownToggle"><span>Gold+</span></div>'
            '<div id="rankDropdownMenu"><div id="rankDropdownOptions">'
            '<a href="/predecessor/heroes/kaelen/build/jungle/gold">Gold+</a></div></div></div>'
            '<script>' + ("var laneStats = {" * 4_000) + "</script></body></html>"
        )
        t0 = time.perf_counter()
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_adv, "kaelen", "jungle", "gold")
        self.assertLess(time.perf_counter() - t0, 0.25)

        oversized = "a" * (pm.STATZ_MAX_HTML_CHARS + 1)
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum supported size"):
            pm.statz_parse_tierlist(oversized, "gold")
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum supported size"):
            pm.statz_parse_hero_page(oversized, "kaelen", "jungle", "gold")

    def test_f3_requires_single_complete_seven_column_thead(self):
        gold_html = (STATZ_FIXTURES / "tierlist-gold.html").read_text(encoding="utf-8")
        no_thead_gold = re.sub(r"<thead\b.*?</thead>", "", gold_html, count=1, flags=re.S | re.I)
        self.assertNotEqual(no_thead_gold, gold_html)
        for call in (
            lambda: pm.statz_parse_tierlist(no_thead_gold, "gold"),
            lambda: pm.statz_parse_tierlist(no_thead_gold),
        ):
            with self.assertRaises(pm.StatzParseError):
                call()

        base = _synthetic_tierlist_html()
        header_error_cases = [
            # Unterminated <thead> before <tbody>
            gold_html.replace("</thead>", "", 1),
            # Truncated mid-<thead> at EOF
            gold_html[: gold_html.index("</thead>")],
            # Unterminated header <tr> inside <thead>
            base.replace("</tr></thead>", "</thead>", 1),
            # Unterminated <th> inside <thead>
            base.replace("<th>Rank</th>", "<th>Rank", 1),
            # Empty <thead>
            re.sub(r"<thead\b.*?</thead>", "<thead></thead>", base, count=1, flags=re.S),
            # Duplicate <thead>
            base.replace("</thead>", "</thead><thead><tr><th>Rank</th></tr></thead>", 1),
            # 7 headers split across 2 <tr> rows inside <thead>
            base.replace("<th>Tier</th>", "<th>Tier</th></tr><tr>", 1),
            # Missing 7th header column
            _synthetic_tierlist_html(headers=("Rank", "Role", "Hero", "Tier", "Win Rate", "Pick Rate")),
            # Missing #heroTable wrapper (no implicit headerless legacy fallback)
            _synthetic_tierlist_html(include_table=False),
            # Unterminated #heroTable
            base.replace("</table>", "", 1),
        ]
        for bad_html in header_error_cases:
            with self.assertRaises(pm.StatzParseError):
                pm.statz_parse_tierlist(bad_html, "gold")

    def test_f4_dropdown_options_read_only_dropdown_container_on_tierlist_and_hero_pages(self):
        # 1. Tier-list: empty #rankDropdownOptions + matching footer link must still fail as 0 options parsed
        empty_opts_with_footer = _synthetic_tierlist_html(options=()).replace(
            "</body>",
            '<footer><a href=/predecessor/hero-tier-list/gold>Gold+</a></footer></body>',
            1,
        )
        with self.assertRaisesRegex(pm.StatzParseError, "0 bracket options parsed"):
            pm.statz_parse_tierlist(empty_opts_with_footer, "gold")

        # 2. Tier-list: stale paragon link outside #rankDropdownOptions must not make paragon look offered
        paragon_html = (STATZ_FIXTURES / "tierlist-paragon.html").read_text(encoding="utf-8")
        stale_paragon_tierlist = paragon_html.replace(
            "</body>",
            '<nav><a href="/predecessor/hero-tier-list/paragon">Paragon+</a></nav>'
            '<footer><a href=https://statz.gg/predecessor/hero-tier-list/paragon>Paragon+</a></footer></body>',
            1,
        )
        for call in (
            lambda: pm.statz_parse_tierlist(stale_paragon_tierlist, "paragon"),
            lambda: pm.statz_parse_tierlist(stale_paragon_tierlist),
        ):
            with self.assertRaisesRegex(pm.StatzParseError, "no longer exists on statz.gg"):
                call()

        # 3. Tier-list: unrelated links outside #rankDropdownOptions are excluded from parsed bracket_options
        scoped_tierlist = _synthetic_tierlist_html(options=(("bronze", "Bronze+"), ("gold", "Gold+"))).replace(
            "</body>",
            '<footer><a href=/predecessor/hero-tier-list/silver>Silver+</a>'
            '<a href=/predecessor/hero-tier-list/paragon>Paragon+</a></footer></body>',
            1,
        )
        parsed_scoped = pm.statz_parse_tierlist(scoped_tierlist, "gold")
        self.assertEqual(parsed_scoped["bracket_options"], [("bronze", "Bronze+"), ("gold", "Gold+")])
        with self.assertRaisesRegex(pm.StatzParseError, "no longer exists on statz.gg"):
            pm.statz_parse_tierlist(scoped_tierlist.replace("<span>Gold+</span>", "<span>Silver+</span>", 1), "silver")

        # 4. Tier-list: unterminated or removed #rankDropdownOptions cannot bleed into footer or bypass guard
        unterminated_opts = empty_opts_with_footer.replace('<div id="rankDropdownOptions"></div>', '<div id="rankDropdownOptions">', 1)
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_tierlist(unterminated_opts, "gold")
        no_dropdown_with_footer = _synthetic_tierlist_html(include_dropdown=False).replace(
            "</body>",
            '<footer><a href=/predecessor/hero-tier-list/gold>Gold+</a></footer></body>',
            1,
        )
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_tierlist(no_dropdown_with_footer)

        # 5. Hero build page: empty #rankDropdownOptions + matching footer link must fail as 0 options parsed
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")
        hero_empty_opts = re.sub(
            r'(<div id="rankDropdownOptions">).*?(</div>\s*</div>\s*</div>)',
            r"\1\2",
            hero_html,
            count=1,
            flags=re.S,
        )
        self.assertNotEqual(hero_empty_opts, hero_html)
        hero_empty_with_footer = hero_empty_opts.replace(
            "</body>",
            '<footer><a href=/predecessor/heroes/kaelen/build/jungle/gold>Gold+</a></footer></body>',
            1,
        )
        with self.assertRaisesRegex(pm.StatzParseError, "0 bracket options parsed"):
            pm.statz_parse_hero_page(hero_empty_with_footer, "kaelen", "jungle", "gold")

        # 6. Hero build page: stale paragon link outside #rankDropdownOptions must not make paragon look offered
        hero_stale_paragon = hero_html.replace(
            "</body>",
            '<footer><a href=/predecessor/heroes/kaelen/build/jungle/paragon>Paragon+</a></footer></body>',
            1,
        )
        with self.assertRaisesRegex(pm.StatzParseError, "no longer exists on statz.gg"):
            pm.statz_parse_hero_page(hero_stale_paragon, "kaelen", "jungle", "paragon")

        # 7. Hero build page: unterminated or stripped dropdown container fails loudly
        hero_unterminated_opts = hero_empty_with_footer.replace(
            '<div id="rankDropdownOptions"></div>',
            '<div id="rankDropdownOptions">',
            1,
        )
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_unterminated_opts, "kaelen", "jungle", "gold")
        hero_no_dropdown = re.sub(
            r'<div class="rank-dropdown">.*?</div>\s*</div>\s*</div>\s*</div>',
            "",
            hero_html,
            count=1,
            flags=re.S,
        )
        with self.assertRaises(pm.StatzParseError):
            pm.statz_parse_hero_page(hero_no_dropdown, "kaelen", "jungle", "gold")

    def test_r1_raw_table_tag_regex_has_no_quadratic_whitespace_overlap(self):
        gold_html = (STATZ_FIXTURES / "tierlist-gold.html").read_text(encoding="utf-8")
        expected = pm.statz_parse_tierlist(gold_html, "gold")
        t_start = time.perf_counter()

        # Direct regex check at 40k spaces (old <\s*/?\s* took ~3.7 s; must finish well under 1 s)
        t0 = time.perf_counter()
        self.assertIsNone(pm.STATZ_RAW_TABLE_TAG_RX.search("<" + (" " * 40_000) + "x"))
        self.assertIsNone(pm.STATZ_RAW_TABLE_TAG_RX.search("<" + (" " * 32_000) + "/" + (" " * 32_000) + "x"))
        self.assertLess(time.perf_counter() - t0, 0.25)

        # Full-page parses with 40k/64k spaces after both entity &lt; and raw < (old took > 2.8 s at 36k)
        for snippet in (
            "<p>&lt;" + (" " * 40_000) + "x</p>",
            "<p><" + (" " * 64_000) + "x</p>",
            "<p><" + (" " * 32_000) + "/" + (" " * 32_000) + "x</p>",
        ):
            payload = gold_html.replace("<body>", "<body>" + snippet, 1)
            t0 = time.perf_counter()
            parsed = pm.statz_parse_tierlist(payload, "gold")
            self.assertLess(time.perf_counter() - t0, 0.5)
            self.assertEqual(parsed["rows"], expected["rows"])

        self.assertLess(time.perf_counter() - t_start, 1.0)

    def test_r2_unmatched_closing_tags_and_outer_nesting_run_in_linear_time(self):
        gold_html = (STATZ_FIXTURES / "tierlist-gold.html").read_text(encoding="utf-8")
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")
        expected = pm.statz_parse_tierlist(gold_html, "gold")
        t_start = time.perf_counter()

        # 16k open <div> + 16k unmatched </x> (old code exceeded 4 s at 16k and took > 3.1 s at 10k)
        outer_noise = ("<div>" * 16_000) + ("</x>" * 16_000)
        t0 = time.perf_counter()
        parsed_gold = pm.statz_parse_tierlist(gold_html.replace("<body>", "<body>" + outer_noise, 1), "gold")
        self.assertLess(time.perf_counter() - t0, 0.5)
        self.assertEqual(parsed_gold["rows"], expected["rows"])

        t0 = time.perf_counter()
        parsed_hero = pm.statz_parse_hero_page(
            hero_html.replace("<body>", "<body>" + outer_noise, 1), "kaelen", "jungle", "gold"
        )
        self.assertLess(time.perf_counter() - t0, 0.5)
        self.assertEqual(parsed_hero["laneStats"]["hero"], "kaelen")

        # Excessive nesting inside strict containers fails loudly in bounded time
        deep_span_open = "<span>" * (pm.STATZ_MAX_STRICT_DEPTH + 10)
        deep_span_close = "</span>" * (pm.STATZ_MAX_STRICT_DEPTH + 10)
        deep_dropdown = _synthetic_tierlist_html().replace(
            '<div id="rankDropdownOptions">',
            f'<div id="rankDropdownOptions">{deep_span_open}{deep_span_close}',
            1,
        )
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum depth"):
            pm.statz_parse_tierlist(deep_dropdown, "gold")

        self.assertLess(time.perf_counter() - t_start, 1.0)

    def test_r3_statz_script_var_many_rejected_candidates_runs_without_suffix_slicing(self):
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")
        t_start = time.perf_counter()

        # 60k rejected declarations (old html[end:] slicing took > 5.0 s at 50k)
        many_rejected = "var laneStats = null;void 0;\n" * 60_000
        t0 = time.perf_counter()
        self.assertEqual(pm.statz_script_var(many_rejected, "laneStats"), (False, None))
        self.assertLess(time.perf_counter() - t0, 0.4)

        # Full hero-page parse prefixed with 50k rejected declarations
        prefixed_hero = hero_html.replace(
            "<body>",
            "<body><script>\n" + ("var laneStats = null;void 0;\n" * 50_000) + "</script>",
            1,
        )
        t0 = time.perf_counter()
        parsed = pm.statz_parse_hero_page(prefixed_hero, "kaelen", "jungle", "gold")
        self.assertLess(time.perf_counter() - t0, 0.5)
        self.assertEqual(parsed["laneStats"]["playedGames"], 1182)

        # Adversarial single-line repeated malformed candidates bounded by scan budget / fast semi check
        polyglot_no_semi = 'var laneStats = [' + ('"var laneStats = [", ",", ' * 20_000) + "BAD"
        t0 = time.perf_counter()
        self.assertEqual(pm.statz_script_var(polyglot_no_semi, "laneStats"), (False, None))
        self.assertLess(time.perf_counter() - t0, 0.2)

        polyglot_with_semi = polyglot_no_semi + ";\n"
        t0 = time.perf_counter()
        self.assertEqual(pm.statz_script_var(polyglot_with_semi, "laneStats"), (False, None))
        self.assertLess(time.perf_counter() - t0, 0.2)

        self.assertLess(time.perf_counter() - t_start, 1.0)

    def test_r4_escaped_literal_table_text_is_not_treated_as_malformed_markup(self):
        gold_html = (STATZ_FIXTURES / "tierlist-gold.html").read_text(encoding="utf-8")
        expected = pm.statz_parse_tierlist(gold_html, "gold")
        t_start = time.perf_counter()

        benign_snippets = [
            "<p>Documentation: &lt;tr&gt;</p>",
            "<p>&lt;table id=&quot;heroTable&quot;&gt;&lt;tbody&gt;&lt;td&gt;1&lt;/td&gt;&lt;/tbody&gt;&lt;/table&gt;</p>",
            "<p>&#60;tr&#62; &#x3c;td&#x3e;1&#x3c;/td&#x3e; &#60;/tr&#62;</p>",
            "<!-- <tr><td>commented row</td></tr> -->",
            '<script>var template = "<tr class=\\"stats-table-row\\"><td>1</td></tr>";</script>',
            '<div data-template="<tr><td>quoted attribute</td></tr>"></div>',
        ]
        for snippet in benign_snippets:
            parsed = pm.statz_parse_tierlist(gold_html.replace("<body>", "<body>" + snippet, 1), "gold")
            self.assertEqual(parsed["rows"], expected["rows"], snippet)

        # Genuine raw malformed table markup outside #heroTable still fails loudly
        malformed_raw_snippets = [
            "<p>< tr></p>",
            "<p></ tr></p>",
            "<p>< /tr></p>",
            '<div <tr class="stats-table-row">></div>',
            "<p></tr></p>",
            "<p></table></p>",
        ]
        for bad_snippet in malformed_raw_snippets:
            with self.assertRaises(pm.StatzParseError, msg=bad_snippet):
                pm.statz_parse_tierlist(gold_html.replace("<body>", "<body>" + bad_snippet, 1), "gold")

        self.assertLess(time.perf_counter() - t_start, 1.0)

    def test_r5_numeric_and_percentage_cells_decode_entities_once(self):
        t_start = time.perf_counter()
        base_html = _synthetic_tierlist_html()

        # Double-encoded percentage and numeric cells render literal entity text and must fail loudly
        double_encoded_cases = [
            base_html.replace("58.12%", "58.12&amp;#37;"),
            base_html.replace("58.12%", "58.12&#38;#37;"),
            base_html.replace("13.59%", "13.59&amp;#x25;"),
            base_html.replace(">1<", ">&amp;#49;<", 1),
            base_html.replace("1,182", "1&amp;#44;182"),
            base_html.replace("1,182", "1,18&amp;#50;"),
        ]
        for bad_html in double_encoded_cases:
            with self.assertRaisesRegex(pm.StatzParseError, "numeric cell did not match expected layout"):
                pm.statz_parse_tierlist(bad_html, "gold")

        # Ordinary single-encoded entities decode once and succeed
        single_encoded = (
            base_html.replace(">1<", ">&#49;<", 1)
            .replace("Kaelen\n", "Iggy &amp; Scorch\n", 1)
            .replace("58.12%", "58.12&#37;")
            .replace("13.59%", "13.59&#x25;")
            .replace("1,182", "1&#44;182")
        )
        parsed = pm.statz_parse_tierlist(single_encoded, "gold")
        row = parsed["rows"][0]
        self.assertEqual(row["rank"], 1)
        self.assertEqual(row["display_name"], "Iggy & Scorch")
        self.assertEqual(row["tier"], "S+")
        self.assertEqual(row["winRate"], 58.12)
        self.assertEqual(row["pickRate"], 13.59)
        self.assertEqual(row["matches"], 1182)

        self.assertLess(time.perf_counter() - t_start, 1.0)

    def test_n1_dropdown_options_use_set_and_cap_excessive_option_counts(self):
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")
        hero_empty_opts = re.sub(
            r'(<div id="rankDropdownOptions">).*?(</div>\s*</div>\s*</div>)',
            r"\1\2",
            hero_html,
            count=1,
            flags=re.S,
        )
        self.assertNotEqual(hero_empty_opts, hero_html)

        def hero_with_options(opts):
            links = "".join(
                f'<div class="rank-option"><a href=/predecessor/heroes/kaelen/build/jungle/{seg}>{lbl}</a></div>'
                for seg, lbl in opts
            )
            return hero_empty_opts.replace(
                '<div id="rankDropdownOptions"></div>',
                f'<div id="rankDropdownOptions">{links}</div>',
                1,
            )

        # Up to STATZ_MAX_DROPDOWN_OPTIONS (64) distinct options parse cleanly and preserve order
        opts_64 = tuple((f"r{i}", f"R{i}+") for i in range(pm.STATZ_MAX_DROPDOWN_OPTIONS - 1)) + (("gold", "Gold+"),)
        parsed_tier_64 = pm.statz_parse_tierlist(_synthetic_tierlist_html(options=opts_64), "gold")
        self.assertEqual(parsed_tier_64["bracket_options"], list(opts_64))
        parsed_hero_64 = pm.statz_parse_hero_page(hero_with_options(opts_64), "kaelen", "jungle", "gold")
        self.assertEqual(parsed_hero_64["bracket_label"], "Gold+")

        # Duplicate options still fail loudly on both paths
        dup_opts = (("bronze", "Bronze+"), ("gold", "Gold+"), ("bronze", "Bronze+"))
        with self.assertRaisesRegex(pm.StatzParseError, "duplicate bracket option"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(options=dup_opts), "gold")
        with self.assertRaisesRegex(pm.StatzParseError, "duplicate bracket option"):
            pm.statz_parse_hero_page(hero_with_options(dup_opts), "kaelen", "jungle", "gold")

        # 65 distinct options fail loudly with the explicit count error on both paths
        opts_65 = tuple((f"r{i}", f"R{i}+") for i in range(pm.STATZ_MAX_DROPDOWN_OPTIONS)) + (("gold", "Gold+"),)
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum option count"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(options=opts_65), "gold")
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum option count"):
            pm.statz_parse_hero_page(hero_with_options(opts_65), "kaelen", "jungle", "gold")

        # 16k distinct options: prebuild inputs, then time-bound both default cap rejection (< 1.0s)
        # and full O(n) set-backed parsing (< 1.0s) on both tier-list and hero-page paths
        opts_16k = tuple((f"r{i}", f"R{i}+") for i in range(16_000)) + (("gold", "Gold+"),)
        tier_16k_html = _synthetic_tierlist_html(options=opts_16k)
        hero_16k_html = hero_with_options(opts_16k)

        t0 = time.perf_counter()
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum option count"):
            pm.statz_parse_tierlist(tier_16k_html, "gold")
        self.assertLess(time.perf_counter() - t0, 1.0)

        t0 = time.perf_counter()
        with self.assertRaisesRegex(pm.StatzParseError, "exceeds maximum option count"):
            pm.statz_parse_hero_page(hero_16k_html, "kaelen", "jungle", "gold")
        self.assertLess(time.perf_counter() - t0, 1.0)

        with mock.patch.object(pm, "STATZ_MAX_DROPDOWN_OPTIONS", 20_000):
            t0 = time.perf_counter()
            parsed_tier_16k = pm.statz_parse_tierlist(tier_16k_html, "gold")
            self.assertLess(time.perf_counter() - t0, 1.0)
            self.assertEqual(len(parsed_tier_16k["bracket_options"]), 16_001)
            self.assertEqual(parsed_tier_16k["bracket_options"][0], ("r0", "R0+"))
            self.assertEqual(parsed_tier_16k["bracket_options"][-1], ("gold", "Gold+"))
            self.assertEqual(len(parsed_tier_16k["rows"]), 1)

            t0 = time.perf_counter()
            parsed_hero_16k = pm.statz_parse_hero_page(hero_16k_html, "kaelen", "jungle", "gold")
            self.assertLess(time.perf_counter() - t0, 1.0)
            self.assertEqual(parsed_hero_16k["laneStats"]["playedGames"], 1182)

    def test_sweep_s1_script_var_long_semicolon_tail_and_multi_script_blocks_are_bounded(self):
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")

        # 5k rejected candidates before a 3.5M-space semicolon tail (51f6286 timed out > 3.5 s
        # rescanning term_m.group(0).lower() on every candidate)
        semi_tail_payload = "<script>" + ("var laneStats = {x " * 5_000) + ";" + (" " * 3_500_000) + "\n</script>"
        t0 = time.perf_counter()
        self.assertEqual(pm.statz_script_var(semi_tail_payload, "laneStats"), (False, None))
        self.assertLess(time.perf_counter() - t0, 0.5)

        # 2k rejected <script> blocks with ';</script>' followed by a valid declaration (51f6286
        # scanned html from index 0 on every candidate and falsely tripped JSON scan budget)
        multi_script_prefix = "<script>var laneStats = {x;</script>\n" * 2_000
        t0 = time.perf_counter()
        self.assertEqual(
            pm.statz_script_var(multi_script_prefix + '<script>var laneStats = {"ok": 1};\n</script>', "laneStats"),
            (True, {"ok": 1}),
        )
        self.assertLess(time.perf_counter() - t0, 0.5)

        prefixed_hero = hero_html.replace("<body>", "<body>" + multi_script_prefix, 1)
        t0 = time.perf_counter()
        parsed_hero = pm.statz_parse_hero_page(prefixed_hero, "kaelen", "jungle", "gold")
        self.assertLess(time.perf_counter() - t0, 0.5)
        self.assertEqual(parsed_hero["laneStats"]["playedGames"], 1182)

        # Valid JSON string containing literal ';</script>' still decodes cleanly
        self.assertEqual(
            pm.statz_script_var('var laneStats = {"note": "a;</script>b", "ok": 2};\n', "laneStats"),
            (True, {"note": "a;</script>b", "ok": 2}),
        )

        # >4300-digit integer literal raises StatzParseError rather than raw ValueError
        oversized_int_js = "var laneStats = [" + ("9" * 5_000) + "];\n"
        t0 = time.perf_counter()
        with self.assertRaisesRegex(pm.StatzParseError, "invalid numeric literal"):
            pm.statz_script_var(oversized_int_js, "laneStats")
        self.assertLess(time.perf_counter() - t0, 0.25)

    def test_sweep_s2_validate_metrics_avoids_quadratic_path_copying_and_deep_recursion(self):
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")

        # 600k-char key + 120k empty sublists (~960 KB JSON; 51f6286 copied 72 GB of path strings > 1.0 s)
        wide_payload = {"x" * 600_000: [[] for _ in range(120_000)]}
        t0 = time.perf_counter()
        pm.validate_metrics(wide_payload, "kaelen/jungle")
        self.assertLess(time.perf_counter() - t0, 0.5)

        # Full hero-page parse with a 300k-char extra key + 60k empty sublists in laneStats
        extra_json = json.dumps({"x" * 300_000: [[] for _ in range(60_000)]})[1:]
        hero_with_wide_ls = hero_html.replace("var laneStats = {", "var laneStats = {" + extra_json[:-1] + ",", 1)
        self.assertNotEqual(hero_with_wide_ls, hero_html)
        t0 = time.perf_counter()
        parsed = pm.statz_parse_hero_page(hero_with_wide_ls, "kaelen", "jungle", "gold")
        self.assertLess(time.perf_counter() - t0, 0.75)
        self.assertEqual(parsed["laneStats"]["playedGames"], 1182)

        # 950-level nested list/dict validates iteratively without RecursionError and formats exact path on error
        deep_root = []
        cur = deep_root
        for _ in range(950):
            nxt = []
            cur.append(nxt)
            cur = nxt
        t0 = time.perf_counter()
        pm.validate_metrics({"extra": deep_root}, "kaelen/jungle")
        self.assertLess(time.perf_counter() - t0, 0.25)

        cur.append({"pickRate": 105})
        with self.assertRaisesRegex(
            ValueError, r"^kaelen/jungle\.extra(?:\[0\]){951}\.pickRate: out of range \(105\)$"
        ):
            pm.validate_metrics({"extra": deep_root}, "kaelen/jungle")

    def test_q1_shared_region_rejected_candidates_charge_relative_offsets(self):
        hero_html = (STATZ_FIXTURES / "hero-kaelen-jungle-gold.html").read_text(encoding="utf-8")

        # Codex Q1 reproduction: closed JS comment with 2,000 non-JSON candidates sharing a region
        prefix = "<script>/*" + ("var\tlaneStats = {x:1};void 0;" * 2000) + "*/\n</script>"
        html = hero_html.replace("<body>", "<body>" + prefix, 1)
        t0 = time.perf_counter()
        parsed = pm.statz_parse_hero_page(html, "kaelen", "jungle", "gold")
        self.assertLess(time.perf_counter() - t0, 0.5)
        self.assertEqual(parsed["patch"], "1.18")
        self.assertEqual(parsed["bracket_label"], "Gold+")
        self.assertEqual(parsed["laneStats"]["ranked"], "Gold")
        self.assertEqual(parsed["laneStats"]["hero"], "kaelen")
        self.assertEqual(parsed["laneStats"]["lane"].lower(), "jungle")
        self.assertEqual(parsed["laneStats"]["playedGames"], 1182)

        # Helper-only equivalents: rejected non-JSON JS objects sharing a terminator before valid JSON
        comment_js = "/*" + ("var\tlaneStats = {x:1};void 0;" * 2000) + '*/var laneStats = {"ok": 1};\n'
        self.assertEqual(pm.statz_script_var(comment_js, "laneStats"), (True, {"ok": 1}))

        inline_js = ("var laneStats = {x: 1}; void 0; " * 2000) + 'var laneStats = {"ok": 1};\n'
        self.assertEqual(pm.statz_script_var(inline_js, "laneStats"), (True, {"ok": 1}))

        # 50k rejected candidates sharing a region run in bounded linear time (< 0.5s; unwindowed JSONDecodeError took ~20s)
        comment_50k = "/*" + ("var\tlaneStats = {x:1};void 0;" * 50_000) + '*/var laneStats = {"ok": 50};\n'
        t0 = time.perf_counter()
        self.assertEqual(pm.statz_script_var(comment_50k, "laneStats"), (True, {"ok": 50}))
        self.assertLess(time.perf_counter() - t0, 0.5)

        # Extension retry (;</script> inside string) after shared-region rejected candidates (local_pos > 0)
        retry_ok_js = (
            "<script>/*"
            + ("var\tlaneStats = {x:1};void 0;" * 2000)
            + '*/var laneStats = {"note": "a;</script>b", "ok": 2};\n</script>'
        )
        self.assertEqual(
            pm.statz_script_var(retry_ok_js, "laneStats"),
            (True, {"note": "a;</script>b", "ok": 2}),
        )

        # Extension retry decodes from 0 and still enforces overall scan_budget when retry work is excessive
        retry_over_budget_js = (
            "<script>/* var laneStats = {x:1}; "
            + ("p" * 80_000)
            + ' */var laneStats = ["a;</script>'
            + (("x" * 60_000 + ";</script>") * 9)
            + '"];\n</script>'
        )
        with self.assertRaisesRegex(pm.StatzParseError, "exceeded JSON scan budget"):
            pm.statz_script_var(retry_over_budget_js, "laneStats")

    def test_statz_fixtures_and_parser_hashes_match_source_manifest(self):
        manifest = json.loads((ROOT / "SOURCE-MANIFEST.json").read_text(encoding="utf-8"))
        files = manifest["files"]
        expected_fixtures = [
            "tests/fixtures/statz/tierlist-bronze.html",
            "tests/fixtures/statz/tierlist-silver.html",
            "tests/fixtures/statz/tierlist-gold.html",
            "tests/fixtures/statz/tierlist-platinum.html",
            "tests/fixtures/statz/tierlist-diamond.html",
            "tests/fixtures/statz/tierlist-master.html",
            "tests/fixtures/statz/tierlist-paragon.html",
            "tests/fixtures/statz/hero-kaelen-jungle-gold.html",
            "tests/fixtures/statz/hero-kaelen-jungle-master.html",
        ]
        for rel in expected_fixtures:
            raw = (ROOT / rel).read_bytes()
            self.assertGreater(len(raw), 0, rel)
            self.assertEqual(files.get(rel), hashlib.sha256(raw).hexdigest(), rel)
        for rel in (".gitattributes", "predecessor_meta.py", "tests/test_static_statz_parser.py"):
            lf_bytes = (ROOT / rel).read_text(encoding="utf-8").replace("\r\n", "\n").encode("utf-8")
            self.assertEqual(files.get(rel), hashlib.sha256(lf_bytes).hexdigest(), rel)


if __name__ == "__main__":
    unittest.main()
