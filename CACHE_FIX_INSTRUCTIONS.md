# Cache Fix Upload

Replace these files in GitHub:

- `index.html`
- `js/app.js`

The new `index.html` references versioned CSS and JavaScript URLs, forcing browsers and GitHub Pages to load the current build instead of an older cached file.

After GitHub Pages redeploys, open the live site and perform one hard refresh:

- Mac Chrome: `Command + Shift + R`
- Windows Chrome: `Ctrl + Shift + R`

The header should then show the data date and record counts.
