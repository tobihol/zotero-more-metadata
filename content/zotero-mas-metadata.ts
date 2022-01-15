declare const Zotero: any
declare const ZoteroItemPane: any
declare const Components: any
declare const window: any

import { getPref, clearPref, loadURI, getDOI } from './utils'
import { patch as $patch$ } from './monkey-patch'
import { attributes } from './attributes'
import { MASProgressWindow } from './mas-progress-window'
import { requestChainS2 } from './s2-api-request'
import { DBConnection } from './db'

const MASMetaData = new class { // tslint:disable-line:variable-name
  public masDatabase: object = {}
  private initialized: boolean = false
  private reloaded: boolean = typeof Zotero.MASMetaData !== 'undefined'
  private observer: number = null
  private progressWin: MASProgressWindow = null
  private bundle: any

  public openPreferenceWindow(paneID, action) {
    const io = { pane: paneID, action }
    window.openDialog('chrome://zotero-mas-metadata/content/options.xul',
      'mas-metadata-pref',
      'chrome,titlebar,toolbar,centerscreen' + Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal', io
    )
  }

  public setPrefToDefault(pref) {
    clearPref(pref)
  }

  public loadURI(uri) {
    loadURI(uri)
  }

  public updateSelectedItems(operation) {
    const items = Zotero.getActiveZoteroPane().getSelectedItems()
    this.updateItems(items, operation)
  }

  public getString(name: string, params: object = {}) {
    const str = this.bundle.GetStringFromName(name)
    return str.replace(/{{(.*?)}}/g, (match, param) => `${(params[param] || '')}`)
  }

  public notify(action, type, ids) {
    if (type === 'item' && action === 'add' && getPref('autoretrieve')) {
      this.updateItems(Zotero.Items.get(ids), 'update')
    }
  }

  public async load() {
    if (this.initialized) return
    this.initialized = true
    this.bundle = Components.classes['@mozilla.org/intl/stringbundle;1']
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle('chrome://zotero-mas-metadata/locale/zotero-mas-metadata.properties')
    this.observer = Zotero.Notifier.registerObserver(this, ['item'], 'MASMetaData')
    const attributesToDisplay = attributes.display
    this.patchXUL(attributesToDisplay)
    this.patchFunctions(attributesToDisplay)
    // Zotero.Schema.schemaUpdatePromise is an alternative that takes longer
    Zotero.uiReadyPromise.then(async () => {
      await this.dbStartup()
    })
  }

  public async unload() {
    Zotero.Notifier.unregisterObserver(this.observer)
  }

  private async dbStartup() {
    const conn = new DBConnection()
    // create table if needed and check integrity of db
    await conn.createTable() // TODO make this more descriptive
    await conn.check()
    // delete entries that are no longer in the zotero db
    const ids = await Zotero.DB.columnQueryAsync('SELECT itemID FROM items') // TODO check wether this should be done with getAllItems() instead
    await conn.deleteEntriesOtherThanIDs(ids)
    // load the remaining entries
    this.masDatabase = await conn.readAllItemsFromDB()
    conn.close()
  }

  private async getAllItems() {
    const libraries = await Zotero.Libraries.getAll()
    let items = []
    for (const lib of libraries) {
      const itemsInLib = await Zotero.Items.getAll(lib.id, true, false)
      items.push(...itemsInLib)
    }
    items = this.filterItems(items)
    return items
  }

  private patchXUL(attributesToDisplay) {
    const xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul'
    const attributeKeyList = Object.keys(attributesToDisplay)
    // patch for tab
    const tabsContainer = document.getElementById('mas-metadata-fields')
    attributeKeyList.forEach(attr => {
      const newRow = document.createElementNS(xul, 'row')
      newRow.setAttribute('class', 'zotero-item-first-row')
      const newLabel = document.createElement('label')
      newLabel.setAttribute('id', `mas-metadata-tab-${attr}-label`)
      newLabel.setAttribute('value', `${attr}:`)
      const newTestbox = document.createElement('textbox')
      newTestbox.setAttribute('id', `mas-metadata-tab-${attr}-display`)
      newTestbox.setAttribute('class', 'plain')
      newTestbox.setAttribute('readonly', 'true')
      newTestbox.setAttribute('value', 'undefined')
      if (['URL', 'Authors', 'TLDR'].includes(attr)) newTestbox.setAttribute('multiline', 'true')
      newRow.appendChild(newLabel)
      newRow.appendChild(newTestbox)
      tabsContainer.appendChild(newRow)
    })

    // patch for columns
    const columnsContainer = document.getElementById('zotero-items-columns-header')
    attributeKeyList.forEach(attr => {
      const newTreecol = document.createElementNS(xul, 'treecol')
      newTreecol.setAttribute('id', `zotero-items-column-mas-metadata-${attr}`)
      newTreecol.setAttribute('mas-metadata-menu', 'true')
      newTreecol.setAttribute('label', `${attr}`)
      newTreecol.setAttribute('flex', '1')
      newTreecol.setAttribute('insertafter', 'zotero-items-column-title')
      newTreecol.setAttribute('zotero-persist', 'width ordinal hidden sortActive sortDirection')
      const newSplitter = document.createElementNS(xul, 'splitter')
      columnsContainer.appendChild(newTreecol)

      newSplitter.setAttribute('class', 'tree-splitter')
      columnsContainer.appendChild(newSplitter)
    })

    // restore column setting for the dynamically created columns
    Zotero.getActiveZoteroPane().unserializePersist()
  }

  private patchFunctions(attributesToDisplay) {
    /**
     * patches for tab
     */

    // tslint:disable-next-line: space-before-function-paren
    $patch$(ZoteroItemPane, 'viewItem', original => async function (item, _mode, _index) {
      await original.apply(this, arguments)
      if (!item.isNote() && !item.isAttachment()) {
        Object.keys(attributesToDisplay).forEach(attr => {
          const masAttr = attributesToDisplay[attr]
          const value = MASMetaData.getMASMetaData(item, masAttr)
          document.getElementById(`mas-metadata-tab-${attr}-display`).setAttribute('value', value)
        })
      }
    })

    // avoid repatch
    if (this.reloaded) { return }

    /**
     * patches for columns 
     */

    // tslint:disable-next-line: space-before-function-paren
    $patch$(Zotero.Item.prototype, 'getField', original => function (field, unformatted, includeBaseMapped) {
      if (typeof field === 'string') {
        const match = field.match(/^mas-metadata-/)
        if (match) {
          const attr = field.slice(match[0].length)
          const item = this
          const masAttr = attributesToDisplay[attr]
          if (!this.isNote() && !this.isAttachment()) {
            const value = MASMetaData.getMASMetaData(item, masAttr)
            return value
          } else {
            return '' // TODO: do proper error handling here
          }
        }
      }
      return original.apply(this, arguments)
    })

    // tslint:disable-next-line: space-before-function-paren
    $patch$(Zotero.ItemTreeView.prototype, 'getCellText', original => function (row, col) {
      const match = col.id.match(/^zotero-items-column-mas-metadata-/)
      if (!match) return original.apply(this, arguments)
      const item = this.getRow(row).ref
      if (item.isNote() || item.isAttachment()) return ''
      const attr = col.id.slice(match[0].length)
      const masAttr = attributesToDisplay[attr]
      const value = MASMetaData.getMASMetaData(item, masAttr)
      return value
    })

    /**
     * patches for columns submenu
     */

    // tslint:disable-next-line: space-before-function-paren
    $patch$(Zotero.ItemTreeView.prototype, 'onColumnPickerShowing', original => function (event) {
      const menupopup = event.originalTarget

      const ns = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul'
      const prefix = 'zotero-column-header-'
      const doc = menupopup.ownerDocument

      const anonid = menupopup.getAttribute('anonid')
      if (anonid.indexOf(prefix) === 0) {
        return
      }

      const lastChild = menupopup.lastChild

      try {
        // More Columns menu
        const id = prefix + 'mas-metadata-menu'

        const masMenu = doc.createElementNS(ns, 'menu')
        // masMenu.setAttribute('label', Zotero.getString('pane.items.columnChooser.moreColumns'))
        masMenu.setAttribute('label', 'MASMetaData')
        masMenu.setAttribute('anonid', id)

        const masMenuPopup = doc.createElementNS(ns, 'menupopup')
        masMenuPopup.setAttribute('anonid', id + '-popup')

        const treecols = menupopup.parentNode.parentNode
        const subs = Array.from(treecols.getElementsByAttribute('mas-metadata-menu', 'true')).map((x: any) => x.getAttribute('label'))
        const masItems = []

        for (const elem of menupopup.childNodes) {
          if (elem.localName === 'menuseparator') {
            break
          }
          if (elem.localName === 'menuitem' && subs.indexOf(elem.getAttribute('label')) !== -1) {
            masItems.push(elem)
          }
        }
        // Disable certain fields for feeds
        const labels = Array.from(treecols.getElementsByAttribute('disabled-in', '*'))
          .filter((e: any) => e.getAttribute('disabled-in').split(' ').indexOf(this.collectionTreeRow.type) !== -1)
          .map((e: any) => e.getAttribute('label'))
        for (const elem of menupopup.childNodes) {
          elem.setAttribute('disabled', labels.indexOf(elem.getAttribute('label')) !== -1)
        }
        // Sort fields and move to submenu
        const collation = Zotero.getLocaleCollation()
        masItems.sort((a, b) => {
          return collation.compareString(1, a.getAttribute('label'), b.getAttribute('label'))
        })
        masItems.forEach(elem => {
          masMenuPopup.appendChild(menupopup.removeChild(elem))
        })

        masMenu.appendChild(masMenuPopup)
        menupopup.insertBefore(masMenu, lastChild)
      } catch (e) {
        Components.utils.reportError(e)
        Zotero.debug(e, 1)
      }
      original.apply(this, arguments)
    })
  }

  private filterItems(items: any[]): any[] {
    items = items.filter(item => item.isTopLevelItem())
    items = items.filter(getDOI)
    items = items.filter(item => !item.isNote() && !item.isAttachment())
    return items
  }

  private async updateItems(items, operation) {
    items = this.filterItems(items)
    if (items.length === 0 || (this.progressWin && !this.progressWin.finished)) return
    const conn = new DBConnection()
    this.progressWin = new MASProgressWindow(operation, items.length)
    let promise: Promise<any>
    switch (operation) {
      case 'update':
        promise = this.updateMetaData(conn, items)
        break
      case 'remove':
        promise = this.removeMetaData(conn, items)
        break
      default:
        conn.close()
        this.progressWin.finish()
        // TODO throw some error instead
        Zotero.alter(null, 'test','cant happen')
        break
    }
    promise.finally(() => {
      conn.close()
      this.progressWin.finish()
    })
  }

  private async updateMetaData(conn, items) {
    const promises = []
    const attributesToRequest = Object.values(attributes.request).join(',')
    for (const item of items) {
      const promise = requestChainS2(item, attributesToRequest)
        .then(async (data: any) => {
          await this.setMASMetaData(conn, item, data)
          this.progressWin.next()
        })
        .catch(error => {
          this.progressWin.next(true)
          Zotero.alert(null, 'MAS MetaData', `${error}`)
        })
      promises.push(promise)
    }
    return Promise.all(promises)
  }

  private async removeMetaData(conn, items) {
    const promises = []
    for (const item of items) {
      const promise = this.removeMASMetaData(conn, item)
        .then(() => this.progressWin.next())
        .catch(() => this.progressWin.next(true))
      promises.push(promise)
    }
    return Promise.all(promises)
  }

  private getMASMetaData(item, masAttr) {
    const itemID = item.id

    if (!(itemID in this.masDatabase)) {
      return this.getString('GetData.ItemNotInDatabase')
    }
    const masData = this.masDatabase[itemID]

    let value = masData[masAttr]

    // null or undefined
    if (value == null) {
      return this.getString('GetData.NoData')
    }

    // handle special cases of attributes
    switch (masAttr) {
      // display as date
      case 'lastUpdated':
        value = new Date(value).toLocaleString()
        break
      case 'authors':
        value = value.map(author => `${author.name}, h-index: ${author.hIndex}`).join('\n')
        break
      case 'tldr':
        value = value.text
        break
      case 'externalIds':
        value = value.DOI
        break
      case 'fieldsOfStudy':
        value = value.join(', ')
      default:
        break
    }
    return value
  }

  private async setMASMetaData(conn: DBConnection, item: any, data: any) {
    const itemID = item.id
    data.lastUpdated = new Date().toISOString()
    const entry = { itemID, data }
    await conn.writeItemsToDB([entry])

    const newEntry = await conn.readItemsFromDB([itemID])
    if (newEntry.length === 1) this.masDatabase[itemID] = newEntry[0].data
  }

  private async removeMASMetaData(conn: DBConnection, item) {
    const itemID = item.id
    await conn.deleteEntriesByIDs([itemID])

    const entry = await conn.readItemsFromDB([itemID])
    if (entry.length === 0) delete this.masDatabase[itemID]
  }
}

window.addEventListener('load', event => {
  MASMetaData.load().catch(err => Zotero.logError(err))
}, false)
window.addEventListener('unload', event => {
  MASMetaData.unload().catch(err => Zotero.logError(err))
})

export = MASMetaData

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
