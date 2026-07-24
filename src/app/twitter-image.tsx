// X/Twitter reads its own `twitter:image` tag and does not reliably fall back
// to `og:image`, so this re-exports the same card under the twitter-image file
// convention rather than duplicating the design.
export { default, alt, size, contentType } from "./opengraph-image";
