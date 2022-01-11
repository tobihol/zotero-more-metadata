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
        await this.conn.executeTransaction(async () => {
            for (const mmItem of mmItems) {
                await this.writeItemToDB(mmItem)
            }
        })
    }

    public async readItemsFromDB(dois: string[]): Promise<any[]>{
        const doiString = JSON.stringify(dois).slice(1, -1)
        let queryRes = null
        await this.conn.executeTransaction(async () => {
            queryRes = await this.conn.queryAsync(
                `SELECT * 
            FROM ${PAPER_TABLE_NAME}
            WHERE DOI IN (${doiString})
            `)
        })
        const res = queryRes.map(entry => ({ DOI: entry.DOI, data: JSON.parse(entry.data) }))
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

    public async deleteEntriesByDOI(dois: string[]) {
        await this.conn.executeTransaction(async () => {
            for (const doi of dois) {
                // TODO write this as one query instead of multiple
                await this.conn.queryAsync(
                    `DELETE FROM ${PAPER_TABLE_NAME}
                    WHERE DOI="${doi}"`)
            }
        })
    }

    private async writeItemToDB(mmItem: { DOI: string, data: JSON }) {
        const stringData = JSON.stringify(mmItem.data)
        await this.conn.queryAsync(
            `INSERT OR REPLACE INTO ${PAPER_TABLE_NAME} (DOI, data) VALUES(?, ?)`,
            [mmItem.DOI, stringData]
        )
    }
}
