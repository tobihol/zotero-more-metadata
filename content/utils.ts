declare const Zotero: any

export function loadURI(uri) {
  Zotero.getActiveZoteroPane().loadURI(uri)
}

export function getDOI(item) {
  const res = item.getField('DOI')
  return typeof res === 'string' ? res.toLowerCase().trim() : null
}

/**
 * preference management
 */

export function getPref(pref: string): any {
  return Zotero.Prefs.get('extensions.mas-metadata.' + pref, true)
}

export function setPref(pref: string, value: any) {
  return Zotero.Prefs.set('extensions.mas-metadata.' + pref, value, true)
}

export function clearPref(pref: string) {
  return Zotero.Prefs.clear('extensions.mas-metadata.' + pref, true)
}
