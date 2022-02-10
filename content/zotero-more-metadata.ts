declare const Zotero: any
declare const ZoteroItemPane: any
declare const Components: any
declare const window: any

import { getPref, clearPref, loadURI, getDOI, moreDebug, moreAlert } from './utils'
import { patch, repatch } from './monkey-patch'
import { attributes } from './attributes'
import { MoreProgressWindow } from './more-progress-window'
import { searchPaperWithItem, StatusCode } from './s2-api-request'
import { DBConnection } from './db'

const MoreMetaData = new class { // tslint:disable-line:variable-name
  public moreDatabase: object = {}
  private initialized: boolean = false
  private reloaded: boolean = typeof Zotero.MoreMetaData !== 'undefined'
  private observer: number = null
  private progressWin: MoreProgressWindow = null
  private bundle: any

  public openPreferenceWindow(paneID, action) {
    const io = { pane: paneID, action }
    window.openDialog('chrome://zotero-more-metadata/content/options.xul',
      'more-metadata-pref',
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

  public async setTabState() {
    const tab = document.getElementById('zotero-editpane-more-metadata-tab')
    // TODO currently justs wait 10ms for preference to be update, there probably is a better way to do this
    const timeout = 10
    setTimeout(() => {
      tab.setAttribute('hidden', (!getPref('tab')).toString())
    }, timeout)
  }

  public getString(name: string, params: object = {}) {
    const str = this.bundle.GetStringFromName(name)
    return str.replace(/{{(.*?)}}/g, (match, param) => `${(params[param] || '')}`)
  }

  public notify(action, type, ids) {
    if (type === 'item' && action === 'add' && getPref('auto-retrieve')) {
      this.updateItems(Zotero.Items.get(ids), 'update')
    }
  }

  public async load() {
    if (this.initialized) return
    this.initialized = true
    this.bundle = Components.classes['@mozilla.org/intl/stringbundle;1']
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle('chrome://zotero-more-metadata/locale/zotero-more-metadata.properties')
    this.observer = Zotero.Notifier.registerObserver(this, ['item'], 'MoreMetaData')
    const attributesToDisplay = attributes.display
    this.patchXUL(attributesToDisplay)
    this.patchFunctions(attributesToDisplay)
    // Zotero.Schema.schemaUpdatePromise is an alternative that takes longer
    Zotero.uiReadyPromise.then(async () => {
      this.setTabState()
      await this.dbStartup()
      Zotero.getActiveZoteroPane().itemsView.refresh()
    })
  }

  public async unload() {
    Zotero.Notifier.unregisterObserver(this.observer)
  }

  private async dbStartup() {
    const conn = new DBConnection()
    // create table if needed and check integrity of db
    await conn.createTable()
    await conn.check()
    // delete entries that are no longer in the zotero db
    const ids = await Zotero.DB.columnQueryAsync('SELECT itemID FROM items')
    await conn.deleteEntriesOtherThanIDs(ids)
    // load the remaining entries
    this.moreDatabase = await conn.readAllItemsFromDB()
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
    const tabsContainer = document.getElementById('more-metadata-fields')
    attributeKeyList.forEach(attr => {
      const newRow = document.createElementNS(xul, 'row')
      newRow.setAttribute('class', 'zotero-item-first-row')
      const newLabel = document.createElement('label')
      newLabel.setAttribute('id', `more-metadata-tab-${attr}-label`)
      newLabel.setAttribute('value', `${attr}:`)
      const newTextbox = document.createElement('textbox')
      newTextbox.setAttribute('id', `more-metadata-tab-${attr}-display`)
      newTextbox.setAttribute('class', 'plain')
      newTextbox.setAttribute('readonly', 'true')
      newTextbox.setAttribute('value', 'undefined')
      if (['URL', 'Authors', 'TLDR'].includes(attr)) newTextbox.setAttribute('multiline', 'true')
      newRow.appendChild(newLabel)
      newRow.appendChild(newTextbox)
      tabsContainer.appendChild(newRow)
    })

    // patch for columns
    const columnsContainer = document.getElementById('zotero-items-columns-header')
    attributeKeyList.forEach(attr => {
      const newTreecol = document.createElementNS(xul, 'treecol')
      newTreecol.setAttribute('id', `zotero-items-column-more-metadata-${attr}`)
      newTreecol.setAttribute('more-metadata-menu', 'true')
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
    patch(ZoteroItemPane, 'viewItem', original => async function (item, _mode, _index) {
      await original.apply(this, arguments)
      if (!item.isNote() && !item.isAttachment()) {
        Object.keys(attributesToDisplay).forEach(attr => {
          const moreAttr = attributesToDisplay[attr]
          const value = MoreMetaData.getMoreMetaData(item, moreAttr)
          document.getElementById(`more-metadata-tab-${attr}-display`).setAttribute('value', value)
        })
      }
    })


    /**
     * patches for columns 
     * These need to get repached after closing and opening the Zotero window. I don't know why though.
     */

    // tslint:disable-next-line: space-before-function-paren
    repatch(Zotero.Item.prototype, 'getField', original => function (field, unformatted, includeBaseMapped) {
      if (typeof field === 'string') {
        const match = field.match(/^more-metadata-/)
        if (match) {
          const attr = field.slice(match[0].length)
          const item = this
          const moreAttr = attributesToDisplay[attr]
          if (!this.isNote() && !this.isAttachment()) {
            const value = MoreMetaData.getMoreMetaData(item, moreAttr)
            return value
          } else {
            return ''
          }
        }
      }
      return original.apply(this, arguments)
    })


    // tslint:disable-next-line: space-before-function-paren
    repatch(Zotero.ItemTreeView.prototype, 'getCellText', original => function (row, col) {
      const match = col.id.match(/^zotero-items-column-more-metadata-/)
      if (!match) return original.apply(this, arguments)
      const item = this.getRow(row).ref
      if (item.isNote() || item.isAttachment()) return ''
      const attr = col.id.slice(match[0].length)
      const moreAttr = attributesToDisplay[attr]
      const value = MoreMetaData.getMoreMetaData(item, moreAttr)
      return value
    })

    // avoid repatch
    if (this.reloaded) { return }

    /**
     * patches for columns submenu
     */

    // tslint:disable-next-line: space-before-function-paren
    patch(Zotero.ItemTreeView.prototype, 'onColumnPickerShowing', original => function (event) {
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
        const id = prefix + 'more-metadata-menu'

        const moreMenu = doc.createElementNS(ns, 'menu')
        // moreMenu.setAttribute('label', Zotero.getString('pane.items.columnChooser.moreColumns'))
        moreMenu.setAttribute('label', 'MoreMetaData')
        moreMenu.setAttribute('anonid', id)

        const moreMenuPopup = doc.createElementNS(ns, 'menupopup')
        moreMenuPopup.setAttribute('anonid', id + '-popup')

        const treeCols = menupopup.parentNode.parentNode
        const subs = Array.from(treeCols.getElementsByAttribute('more-metadata-menu', 'true')).map((x: any) => x.getAttribute('label'))
        const moreItems = []

        for (const elem of menupopup.childNodes) {
          if (elem.localName === 'menuseparator') {
            break
          }
          if (elem.localName === 'menuitem' && subs.indexOf(elem.getAttribute('label')) !== -1) {
            moreItems.push(elem)
          }
        }
        // Disable certain fields for feeds
        const labels = Array.from(treeCols.getElementsByAttribute('disabled-in', '*'))
          .filter((e: any) => e.getAttribute('disabled-in').split(' ').indexOf(this.collectionTreeRow.type) !== -1)
          .map((e: any) => e.getAttribute('label'))
        for (const elem of menupopup.childNodes) {
          elem.setAttribute('disabled', labels.indexOf(elem.getAttribute('label')) !== -1)
        }
        // Sort fields and move to submenu
        const collation = Zotero.getLocaleCollation()
        moreItems.sort((a, b) => {
          return collation.compareString(1, a.getAttribute('label'), b.getAttribute('label'))
        })
        moreItems.forEach(elem => {
          moreMenuPopup.appendChild(menupopup.removeChild(elem))
        })

        moreMenu.appendChild(moreMenuPopup)
        menupopup.insertBefore(moreMenu, lastChild)
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
    this.progressWin = new MoreProgressWindow(operation, items.length)
    let promise: Promise<any>
    switch (operation) {
      case 'update':
        promise = this.updateMetaDataOperation(conn, items)
        break
      case 'remove':
        promise = this.removeMetaDataOperation(conn, items)
        break
      default:
        conn.close()
        this.progressWin.finish()
        Zotero.logError(new Error(`Invalid operation: ${operation}`))
        break
    }
    promise.finally(() => {
      conn.close()
      this.progressWin.finish()
    })
  }

  private async updateMetaDataOperation(conn, items) {
    const attributesToRequest = Object.values(attributes.request).join(',')
    let stop = false
    this.progressWin.addOnClickFunc(() => {
      this.progressWin.operation = 'abort'
      stop = true
    })
    for (const item of items) {
      if (stop) break
      const promise = searchPaperWithItem(item, attributesToRequest)
        .then(async (data: any) => {
          await this.setMetaData(conn, item, data)
          this.progressWin.next()
        })
        .catch(error => {
          switch (error.status) {
            // rate limit reached
            case StatusCode.Ratelimit:
              this.progressWin.operation = 'ratelimit'
              stop = true
              break
            // cant find doi
            case StatusCode.NotFound:
              this.progressWin.next(true)
              break
            // other errors
            default:
              this.progressWin.operation = 'abort'
              stop = true
              moreAlert(JSON.stringify(error))
              break
            }
        })
      await promise
    }
  }

  private async removeMetaDataOperation(conn, items) {
    const promises = []
    for (const item of items) {
      const promise = this.removeMetaData(conn, item)
        .then(() => this.progressWin.next())
        .catch(() => this.progressWin.next(true))
      promises.push(promise)
    }
    return Promise.all(promises)
  }

  private getMoreMetaData(item, moreAttr) {
    const itemID = item.id

    if (!(itemID in this.moreDatabase)) {
      return this.getString('GetData.ItemNotInDatabase')
    }
    const moreData = this.moreDatabase[itemID]

    let value = moreData[moreAttr]

    // null or undefined
    if (value == null) {
      return this.getString('GetData.NoData')
    }

    // handle special cases of attributes
    switch (moreAttr) {
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

  private async setMetaData(conn: DBConnection, item: any, data: any) {
    const itemID = item.id
    data.lastUpdated = new Date().toISOString()
    const entry = { itemID, data }
    await conn.writeItemsToDB([entry])

    const newEntry = await conn.readItemsFromDB([itemID])
    if (newEntry.length === 1) {
      this.moreDatabase[itemID] = newEntry[0].data
      Zotero.Notifier.trigger('modify', 'item', [itemID], {})
    } else {
      moreDebug(`Can't update entry ${newEntry}`)
    }
  }

  private async removeMetaData(conn: DBConnection, item: any) {
    const itemID = item.id
    await conn.deleteEntriesByIDs([itemID])

    const entry = await conn.readItemsFromDB([itemID])
    if (entry.length === 0) {
      delete this.moreDatabase[itemID]
      Zotero.Notifier.trigger('modify', 'item', [itemID], {})
    } else {
      moreDebug(`Can't delete entry ${entry}`)
    }
  }
}

window.addEventListener('load', event => {
  MoreMetaData.load().catch(err => Zotero.logError(err))
}, false)
window.addEventListener('unload', event => {
  MoreMetaData.unload().catch(err => Zotero.logError(err))
})

export = MoreMetaData

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
