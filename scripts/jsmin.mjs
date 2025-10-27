const EOF = '';

function isAlphanum(character) {
  if (!character || character === EOF) {
    return false;
  }

  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    character === '_' ||
    character === '$' ||
    character === '\\' ||
    code > 126
  );
}

export function minify(source) {
  let index = 0;
  let theA = '\n';
  let theB = EOF;
  let theLookahead = null;
  let output = '';

  function error(message) {
    const position = Math.max(0, index - 1);
    throw new Error(`${message} (posición ${position})`);
  }

  function get() {
    let character;

    if (theLookahead !== null) {
      character = theLookahead;
      theLookahead = null;
    } else if (index < source.length) {
      character = source[index];
      index += 1;
    } else {
      return EOF;
    }

    if (character === '\r') {
      return '\n';
    }

    if (character === '\n' || character >= ' ') {
      return character;
    }

    return ' ';
  }

  function peek() {
    theLookahead = get();
    return theLookahead;
  }

  function next() {
    let character = get();

    if (character === '/') {
      const nextCharacter = peek();

      if (nextCharacter === '/') {
        while (character !== '\n' && character !== EOF) {
          character = get();
        }
        return character;
      }

      if (nextCharacter === '*') {
        get();
        while (true) {
          character = get();
          if (character === EOF) {
            error('Comentario sin cerrar');
          }
          if (character === '*' && peek() === '/') {
            get();
            return ' ';
          }
        }
      }
    }

    return character;
  }

  function emit(character) {
    output += character;
  }

  function handleString(delimiter) {
    emit(delimiter);
    while (true) {
      const character = get();
      if (character === EOF) {
        error('Cadena sin cerrar');
      }
      emit(character);
      if (character === delimiter) {
        break;
      }
      if (character === '\\') {
        const escape = get();
        if (escape === EOF) {
          error('Escape sin cerrar');
        }
        emit(escape);
      }
    }
  }

  function handleRegExp() {
    emit(theA);
    emit(theB);
    while (true) {
      let character = get();
      if (character === EOF) {
        error('Expresión regular sin cerrar');
      }
      if (character === '\\') {
        emit(character);
        character = get();
        if (character === EOF) {
          error('Expresión regular sin cerrar');
        }
        emit(character);
        continue;
      }
      if (character === '/') {
        emit(character);
        break;
      }
      if (character === '\n') {
        error('Expresión regular sin cerrar');
      }
      emit(character);
    }
    theB = next();
  }

  function action(option) {
    switch (option) {
      case 1:
        emit(theA);
      // fallthrough
      case 2:
        theA = theB;
        if (theA === '\'' || theA === '"' || theA === '`') {
          handleString(theA);
          theA = get();
        }
      // fallthrough
      case 3:
        theB = next();
        if (
          theB === '/' &&
          (theA === '(' ||
            theA === ',' ||
            theA === '=' ||
            theA === ':' ||
            theA === '[' ||
            theA === '!' ||
            theA === '&' ||
            theA === '|' ||
            theA === '?' ||
            theA === '{' ||
            theA === '}' ||
            theA === ';' ||
            theA === '\n')
        ) {
          handleRegExp();
        }
        break;
      default:
        break;
    }
  }

  function minifyLoop() {
    action(3);
    theA = '\n';

    while (theA !== EOF) {
      switch (theA) {
        case ' ':
          if (isAlphanum(theB)) {
            action(1);
          } else {
            action(2);
          }
          break;
        case '\n':
          switch (theB) {
            case '{':
            case '[':
            case '(':
            case '+':
            case '-':
              action(1);
              break;
            case ' ':
              action(3);
              break;
            default:
              if (isAlphanum(theB)) {
                action(1);
              } else {
                action(2);
              }
              break;
          }
          break;
        default:
          switch (theB) {
            case ' ':
              if (isAlphanum(theA)) {
                action(1);
              } else {
                action(3);
              }
              break;
            case '\n':
              switch (theA) {
                case '}':
                case ']':
                case ')':
                case '+':
                case '-':
                case '"':
                case '\'':
                case '`':
                  action(1);
                  break;
                default:
                  if (isAlphanum(theA)) {
                    action(1);
                  } else {
                    action(3);
                  }
                  break;
              }
              break;
            default:
              action(1);
              break;
          }
          break;
      }
    }
  }

  minifyLoop();

  return output;
}
