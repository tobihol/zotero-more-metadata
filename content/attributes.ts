// tslint:disable:object-literal-key-quotes
export const attributes = {
  'request': {
    'S2ID': 'paperId', // Always included
    'Other IDs': 'externalIds',
    'URL': 'url',
    'Title': 'title', // Included if no fields are specified
    'Abstract': 'abstract',
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
  },
  'display': {
    'Last Updated': 'lastUpdated',
    'S2ID': 'paperId',
    'DOI': 'externalIds.DOI',
    'Citations': 'citationCount',
    'Influential Citations': 'influentialCitationCount',
    'Fields': 'fieldsOfStudy',
    'OpenAccess': 'isOpenAccess',
  },
}
