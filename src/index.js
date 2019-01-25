import stripComments from 'strip-json-comments';
import less from 'less';

const varRgx = /^[@$]/;
const followVar = (value, lessVars, dictionary) => {
  if (varRgx.test(value)) {
    // value is a variable
    return followVar(lessVars[value] || dictionary[value.replace(varRgx, '')]);
  }
  return value;
};

const getRegexpMatches = (regexp, text) => {
  const matches = [];
  const lastIndex = regexp.lastIndex;
  let match;

  do {
    match = regexp.exec(text);
    if (match) {
      matches.push(match);
    }
    // prevent infinite loop (only regular expressions with `global` flag retain the `lastIndex`)
  } while (match && regexp.global);

  // don't leak `lastIndex` changes
  regexp.lastIndex = lastIndex;

  return matches;
}

export default (sheet, options = {}) => {
  const { dictionary = {}, resolveVariables = false, stripPrefix = false, parseVariables = false } = options;
  let lessVars = {};
  const matches = stripComments(sheet).match(/[@$](.*:[^;]*)/g) || [];
  const transformKey = key => key.replace(varRgx, '');

  matches.forEach(variable => {
    const definition = variable.split(/:\s*/);
    let value = definition.splice(1).join(':');
    value = value.trim().replace(/^["'](.*)["']$/, '$1');
    lessVars[definition[0].replace(/['"]+/g, '').trim()] = value;
  });

  if (resolveVariables) {
    Object.keys(lessVars).forEach(key => {
      const value = lessVars[key];
      lessVars[key] = followVar(value, lessVars, dictionary);
    });
  }

  if (stripPrefix) {
    lessVars = Object.keys(lessVars).reduce((prev, key) => {
      prev[transformKey(key)] = lessVars[key];
      return prev;
    }, {});
  }

  if (parseVariables) {
    const transform = key => {
      const newKey = transformKey(key);
      return `--${newKey}: @${newKey};`;
    };

    less.render(
      `${sheet} #resolved {\n${Object.keys(lessVars).map(varName => transform(varName)).join('\n')}\n}`, (e, result) => {
        if (e) {
          console.warn(`Less render failed! (${e.message}) Less code:\n${sheet}\nVariables found:\n${Object.keys(lessVars)}`);
        } else {
          lessVars = getRegexpMatches(/--([^:]+): ([^;]*);/g, result.css.replace(/#resolved {(.*)}/, '$1')).reduce(
            (acc, [, varName, value]) => Object.assign({}, acc, { [stripPrefix ? varName : `@${varName}`]: value }),
            {}
          );
        }
      }
    );
  }

  return lessVars;
};
