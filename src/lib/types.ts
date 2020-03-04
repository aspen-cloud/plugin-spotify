import { Observable } from "rxjs";

type ResourceGetter = (options?: any) => Observable<any>;

type RateLimit = {
  rate: number;
  limit: number;
};

export interface iResource {
  scopes: string[];
  name: ResourceType;
  label: string;
  get: ResourceGetter;
  rateLimit?: RateLimit;
  options?: any;
  schema?: {};
}

export enum ResourceType {
  tracks = "tracks",
  albums = "albums",
  playlists = "playlists"
}

type AlbumType = "album" | "single" | "compilation";

type ImageObjectType = {
  height: number;
  url: string;
  width: number;
};

type SimpleAlbumType = {
  album_group?: string;
  album_type: AlbumType;
  artists: SimpleArtistType[];
  available_markets: string[];
  external_urls: ExternalURLType;
  href: string;
  id: string;
  images: ImageObjectType[];
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  restrictions: Object;
  type: "album";
  uri: string;
};
type SimpleArtistType = {
  external_urls: ExternalURLType;
  href: string;
  id: string;
  name: string;
  type: "artist";
  uri: string;
};
type ExternalIDType = { [key: string]: string };
type ExternalURLType = { [key: string]: string };
type LinkedTrackType = {
  external_urls: ExternalURLType;
  href: string;
  id: string;
  type: "track";
  uri: string;
};

export type TrackDocType = {
  album: SimpleAlbumType;
  artists: SimpleArtistType;
  available_markets: string[];
  disk_number: number;
  duration_ms: number;
  explicit: boolean;
  external_ids: ExternalIDType;
  external_urls: ExternalURLType;
  href: string;
  id: string;
  is_playlable: boolean;
  linked_from: LinkedTrackType;
  restrictions: any;
  name: string;
  popularity: number;
  preview_url: string;
  track_number: number;
  type: "track";
  uri: string;
};
