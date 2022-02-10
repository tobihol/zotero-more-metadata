declare const Zotero: any

export function loadURI(uri) {
  Zotero.getActiveZoteroPane().loadURI(uri)
}

export function getDOI(item) {
  const res = item.getField('DOI')
  return typeof res === 'string' ? res.toLowerCase().trim() : null
}

export function moreDebug(message: string) {
  Zotero.debug(`[more-metadata]: ${message}`)
}

export function moreAlert(message: string) {
  Zotero.alert(null, 'MoreMetaData', message)
}

/**
 * preference management
 */

export function getPref(pref: string): boolean {
  return Zotero.Prefs.get('extensions.more-metadata.' + pref, true)
}

export function setPref(pref: string, value: boolean) {
  Zotero.Prefs.set('extensions.more-metadata.' + pref, value, true)
}

export function clearPref(pref: string) {
  Zotero.Prefs.clear('extensions.more-metadata.' + pref, true)
}
