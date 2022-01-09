declare const Zotero: any
const DB_NAME = 'more-metadata'
const PAPER_TABLE_NAME = 'papers'
const AUTHOR_TABLE_NAME = 'authors'

export class DBConnection {
    private conn = new Zotero.DBConnection(DB_NAME)

    public async createTable() {
        await this.conn.queryAsync(
            `CREATE TABLE IF NOT EXISTS "${PAPER_TABLE_NAME}" (
             DOI TEXT PRIMARY KEY NOT NULL,
             data TEXT
             )`
        )
    }

    public async check() {
        try {
            await this.conn.integrityCheck()
        } catch (error) {
            Zotero.alert(null, 'MAS MetaData', error)
        }
    }

    public close() {
        this.conn.closeDatabase()
    }

    public async writeItemsToDB(mmItems) {
        for (const mmItem of mmItems) {
            try {
                await this.writeItemToDB(mmItem)
            } catch (error) {
                Zotero.debug(`writeItems Error: ${error}`)
            }
        }
    }

    public async readItemFromDB(doi) {
        const queryRes = await this.conn.queryAsync(
            `SELECT * 
            FROM ${PAPER_TABLE_NAME}
            WHERE DOI = "${doi}"
            `)
        let res = null
        switch (queryRes.length) {
            case 0:
                res = null
                break
            case 1:
                const entry = queryRes[0]
                res =  {DOI: entry.DOI, data: JSON.parse(entry.data)}
                break
            default:
                Zotero.error('TODO cant happen because doi is unique')
                break
        }
        return res
    }

    public async readAllItemsFromDB() {
        const res = {}
        const queryRes = await this.conn.queryAsync(`SELECT * FROM ${PAPER_TABLE_NAME}`)
        for (const row of queryRes) {
            res[row.DOI] = JSON.parse(row.data)
        }
        return res
    }

    public async deleteEntriesByDOI(dois) {
        try {
            for (const doi of dois) {
                // TODO write this as one query instead of multiple
                await this.conn.queryAsync(
                    `DELETE FROM ${PAPER_TABLE_NAME}
                    WHERE DOI="${doi}"`)
            }
        } catch (error) {
            Zotero.debug(`DeleteEntries Error: ${error}`)
        }
    }

    private async writeItemToDB(mmItem: {DOI: 'string', data: JSON}) {
        const stringData = JSON.stringify(mmItem.data)
        await this.conn.queryAsync(
            `INSERT OR REPLACE INTO ${PAPER_TABLE_NAME} (DOI, data) VALUES('${mmItem.DOI}', '${stringData}')`
        )
    }
}
