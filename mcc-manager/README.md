# Layout

`./css` contains all css files, any files in this folder is shared across all pages and should general
    `./css/pages/` contains a css file for each page that needs custom styling, any per-page stuff should be here
`./js` contains all css files, any files in this folder is shared across all pages and should general
    `./js/pages/` contains a js file for each page that needs custom logic, any per-page stuff should be here

`./pages` contains the html files for each page

`./index.html` is the page mentioned as "start"


# Components
If a html partial is created by JavaScript to be reused across many pages they can be put in `./js/components/{component-name}.js` and `./css/components/{component-name}.css`. And select by ids/classnames on page load, then each page just defines an element with the correct id/classname to be matched by the javascript code.


# Shared code / Libraries
Currently there are some helpers in the project for different uses, that are to general to be a component, these are:
- `./js/cookies.js` + `./css/cookies.css` = Handles a consent box if we are allowed to store stuff in localstorage/sessionstorage/indexeddb
- `./js/monaco.js` + `./css/monaco.css` = Handles a monaco editor class
- `./js/nodes.js` + `./css/nodes.css` + `./js/nodes_renderonly.js` (The reworked binding implementation in nodes.js is prefered heavily) = Handles node graphs
- `./js/partialdc.js` = Defines a class `PartialDataClass`
- `./js/theme.js` = Handles theming
- `./js/popups.js` + ``./css/popups.css` = Handles popups and portals (modals and tooltips)


# Styling
In all css files variables should be used and placed under `:root {}`,
if any colors are needed they should be definded under both `[data-theme="dark"] {}` and `[data-theme="light"] {}`.


# Formatting
Code should use indentation of four spaces.