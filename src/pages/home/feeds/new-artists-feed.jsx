import { gql, request } from 'graphql-request'
import TokenCollection from '@atoms/token-collection'
import { BaseTokenFieldsFragment } from '@data/api'
import { HEN_CONTRACT_FA2 } from '@constants'

const NEW_OBJKTS_QUERY = gql`
  ${BaseTokenFieldsFragment}
  query getNewObjkt($limit: Int!) {
    tokens(
      where: {
        editions: { _gt: "0" },
        metadata_status: { _eq: "processed" },
        fa2_address: { _eq: "${HEN_CONTRACT_FA2}" }
      }
      order_by: { minted_at: desc }
      limit: $limit
    ) {
      ...baseTokenFields
    }
  }
`

async function fetchNewArtistsTokens(limit = 600) {
  const data = await request(
    import.meta.env.VITE_TEIA_GRAPHQL_API,
    NEW_OBJKTS_QUERY,
    { limit }
  )
  const rawTokens = data?.tokens || []

  // Group candidate tokens by unique artist_address
  const artistTokensMap = new Map()
  for (const token of rawTokens) {
    if (!artistTokensMap.has(token.artist_address)) {
      artistTokensMap.set(token.artist_address, [])
    }
    artistTokensMap.get(token.artist_address).push(token)
  }

  const uniqueArtists = Array.from(artistTokensMap.keys())
  if (uniqueArtists.length === 0) return { tokens: [] }

  // Batch query each artist's very first token minted on Teia FA2 contract
  const batchFirstMintQuery = `
    query CheckFirstMints {
      ${uniqueArtists
        .map(
          (addr, idx) => `
        a${idx}: tokens(
          where: {
            artist_address: { _eq: "${addr}" },
            fa2_address: { _eq: "${HEN_CONTRACT_FA2}" }
          }
          order_by: { minted_at: asc }
          limit: 1
        ) {
          token_id
          minted_at
        }
      `
        )
        .join('\n')}
    }
  `

  const firstMintsRes = await request(
    import.meta.env.VITE_TEIA_GRAPHQL_API,
    batchFirstMintQuery
  )

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()

  const newArtistTokens = []
  uniqueArtists.forEach((addr, idx) => {
    const firstMint = firstMintsRes[`a${idx}`]?.[0]
    if (firstMint) {
      const firstMintDate = new Date(firstMint.minted_at).getTime()
      if (now - firstMintDate <= THIRTY_DAYS_MS) {
        newArtistTokens.push(...artistTokensMap.get(addr))
      }
    }
  })

  return { tokens: newArtistTokens }
}

export function NewArtistsFeed() {
  return (
    <TokenCollection
      feeds_menu
      label="New Artists"
      namespace="new-artists-feed"
      maxItems={600}
      query={fetchNewArtistsTokens(600)}
    />
  )
}

export default NewArtistsFeed
