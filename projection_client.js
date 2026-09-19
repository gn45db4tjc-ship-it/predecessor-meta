/* Website delivery projection, client side (audit item 11). Mirrors projection.py.
   decode: restores rows written as {"$c": keys, "$r": rows} to identical objects.
   merge: applies an evidence annex (an overlay) to the loaded data in place, restoring each object's original key
   order ("$order") and addressing list elements by index ("$items"), so core + annexes equal the full bundle. */
(function (root) {
  'use strict';
  function decode(value) {
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 2 && Array.isArray(value.$c) && Array.isArray(value.$r)) {
        return value.$r.map(row => { const out = {}; value.$c.forEach((key, i) => { out[key] = decode(row[i]); }); return out; });
      }
      const out = {};
      for (const key of keys) out[key] = decode(value[key]);
      return out;
    }
    return value;
  }
  const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function merge(target, overlay) {
    for (const [key, value] of Object.entries(overlay)) {
      if (key === '$order') continue;
      if (isObject(value) && isObject(value.$items) && Array.isArray(target[key])) {
        for (const [index, part] of Object.entries(value.$items)) if (isObject(target[key][Number(index)])) merge(target[key][Number(index)], part);
      } else if (isObject(value) && isObject(target[key])) merge(target[key], value);
      else target[key] = value;
    }
    const order = overlay.$order;
    if (Array.isArray(order)) {
      // Rebuild the key order in place, so objects the engine already holds keep their identity.
      const entries = [...order.filter(k => Object.prototype.hasOwnProperty.call(target, k)), ...Object.keys(target).filter(k => !order.includes(k))].map(k => [k, target[k]]);
      for (const key of Object.keys(target)) delete target[key];
      for (const [key, value] of entries) target[key] = value;
    }
    return target;
  }
  const api = {decode, merge, version: 1};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetaProjection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
