export const TrackSchema = {
  title: "Spotify Track",
  description: "A song from Spotify",
  version: 0,
  type: "object",
  properties: {
    album: {
      type: "object",
      properties: {
        album_group: "",
        album_type: {
          enum: ["album", "single", "compilation"]
        },
        artists: {
          type: "array",
          items: {
            type: "object",
            properties: {
              external_urls: { type: "object" },
              href: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              type: { const: "artist" },
              uri: { type: "string" }
            }
          }
        },
        available_markets: {
          type: "array",
          items: {
            type: "string"
          }
        },
        external_urls: { type: "object" },
        href: { type: "string" },
        id: { type: "string" },
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              height: { type: "integer" },
              url: { type: "string" },
              width: { type: "integer" }
            }
          }
        },
        name: { type: "string" },
        release_date: { type: "string" },
        release_date_precision: {
          enum: ["year", "month", "day"]
        },
        restrictions: {
          type: "object"
        },
        type: { const: "album" },
        uri: { type: "string" }
      }
    },
    artists: {},
    available_markets: {},
    disk_number: {},
    duration_ms: {},
    explicit: {},
    external_ids: {},
    external_urls: {},
    href: {},
    id: {},
    is_playlable: {},
    linked_from: {},
    restrictions: {},
    name: {},
    popularity: {
      type: "integer",
      min: 0,
      max: 100
    },
    preview_url: {},
    track_number: {},
    type: "track",
    uri: {}
  },
  required: [
    "artists",
    "available_markets",
    "disk_number",
    "duration_ms",
    "explicit",
    "external_urls",
    "href",
    "id",
    "is_playlable",
    "linked_from",
    "restrictions",
    "name",
    "preview_url",
    "track_number",
    "type",
    "uri",
    "is_local"
  ]
};
