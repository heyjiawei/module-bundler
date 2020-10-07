# Module bundler accepted files

- Only imports .js file extensions. That means no typescript, `.jsx` etc.
- Searches local node_modules only. Will not search `NODE_PATH` environment variable list of absolute paths, or `GLOBAL_FOLDERS`
