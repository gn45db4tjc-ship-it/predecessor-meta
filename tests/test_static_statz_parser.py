"""Offline tests for the statz.gg tier-list and hero-page parsers (Issue #215 / PRED-M4).

No prior Statz HTML fixture tests existed in tests/. These tests exercise the captured
13 Nov 2026 (Patch 1.18) statz.gg fixtures across all six app brackets plus one hero
build page, pre-1.18 layout compatibility, quoted/multi-class HTML variants, and every
integrity guard. Network access is blocked throughout.
"""
import hashlib
import json
from pathlib import Path
import tempfile
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

    def test_collect_bundle_offline_records_explicit_missing_bracket_error_for_paragon(self):
        with tempfile.TemporaryDirectory() as tmp:
            fix = Path(tmp)
            (fix / "tierlist.html").write_bytes((STATZ_FIXTURES / "tierlist-paragon.html").read_bytes())
            (fix / "omeda_heroes.json").write_text(
                json.dumps([{"id": 1, "slug": "kaelen", "display_name": "Kaelen", "roles": ["Jungle"], "abilities": [], "classes": []}]),
                encoding="utf-8",
            )
            (fix / "omeda_items.json").write_text("[]", encoding="utf-8")
            with mock.patch.object(pm, "GUIDANCE_PACKET_OVERRIDE", str(fix / "empty-guidance.json")):
                bundle = pm.collect_bundle({"bracket": "paragon", "concurrency": 1}, fixture_dir=fix)
            self.assertEqual(bundle["tier_list"], [])
            self.assertEqual(bundle["sources"]["statz_tierlist"]["status"], "failed")
            self.assertIn("bracket 'paragon' no longer exists on statz.gg", bundle["sources"]["statz_tierlist"]["error"])
            self.assertEqual(bundle["bracket"]["segment"], "paragon")

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

        # 5. Offered bracket with empty tbody (0 rows)
        with self.assertRaisesRegex(pm.StatzParseError, "0 rows parsed"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(rows_html=[]), "gold")

        # 6. Malformed row (< 7 cells, or extra 8th column such as Ban Rate, or changed thead headers)
        short_row = '<tr class="stats-table-row"><td class="stats-table-data">1</td><td class="stats-table-data">2</td></tr>'
        with self.assertRaisesRegex(pm.StatzParseError, "did not match the expected layout"):
            pm.statz_parse_tierlist(_synthetic_tierlist_html(rows_html=[short_row]), "gold")

        with self.assertRaisesRegex(pm.StatzParseError, "table headers did not match expected layout"):
            pm.statz_parse_tierlist(
                _synthetic_tierlist_html(headers=("Rank", "Role", "Hero", "Tier", "Win Rate", "Pick Rate", "Ban Rate", "Matches")),
                "gold",
            )

        eight_col_row = _synthetic_tierlist_html(include_table=False).replace(
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
        row_chunk = pm.ROW_RX.search(single_row).group(0)
        dup_html = _synthetic_tierlist_html(rows_html=[row_chunk, row_chunk.replace(">1<", ">2<", 1)])
        with self.assertRaisesRegex(pm.StatzParseError, "duplicate hero/role rows"):
            pm.statz_parse_tierlist(dup_html, "gold")

    def test_statz_fixtures_and_parser_hashes_match_source_manifest(self):
        manifest = json.loads((ROOT / "SOURCE-MANIFEST.json").read_text(encoding="utf-8"))
        files = manifest["files"]
        expected_fixtures = [
            "tests/fixtures/statz/tierlist-bronze.html",
            "tests/fixtures/statz/tierlist-silver.html",
            "tests/fixtures/statz/tierlist-gold.html",
            "tests/fixtures/statz/tierlist-platinum.html",
            "tests/fixtures/statz/tierlist-diamond.html",
            "tests/fixtures/statz/tierlist-paragon.html",
            "tests/fixtures/statz/hero-kaelen-jungle-gold.html",
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
