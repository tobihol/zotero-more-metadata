// tslint:disable:object-literal-key-quotes
export const attributes = {
  // attributes that are requested from the S2 API
  'request': {
    'S2ID': 'paperId', // Always included
    'Other IDs': 'externalIds',
    'URL': 'url',
    'Title': 'title', // Included if no fields are specified
    // 'Abstract': 'abstract',
    'Venue': 'venue',
    'Year': 'year',
    'References': 'referenceCount',
    'Citations': 'citationCount',
    'Influential Citations': 'influentialCitationCount',
    'Open Access': 'isOpenAccess',
    'Fields': 'fieldsOfStudy',
    // Up to 500 authors will be returned
    'Author IDs': 'authors.authorId', // Always included
    'Author Names': 'authors.name',
    'Author hIndex': 'authors.hIndex',
    'TLDR': 'tldr', // auto generated TLDR from SciTLDR model
  },
  // attributes that end up being displayed in Zotero
  'display': {
    'TLDR': 'tldr',
    'Fields': 'fieldsOfStudy',
    'Citations': 'citationCount',
    'Inf. Citations': 'influentialCitationCount',
    'Authors': 'authors',
    'Open Access': 'isOpenAccess',
    // 'S2ID': 'paperId',
    'DOI': 'externalIds',
    'URL': 'url',
    'Last Updated': 'lastUpdated', // not part of api response
  },
}
