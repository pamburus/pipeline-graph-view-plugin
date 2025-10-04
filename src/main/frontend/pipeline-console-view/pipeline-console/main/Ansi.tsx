export interface Result {
  isSelectGraphicRendition?: boolean;
  escapeCode?: string; // input
  setFG?: number | { palette256: number } | { rgb: { r: number; g: number; b: number } } | false;
  setBG?: number | { palette256: number } | { rgb: { r: number; g: number; b: number } } | false;
  resetFG?: boolean; // true if contains a reset back to default foreground
  resetBG?: boolean; // true if contains a reset back to default background
}

/**
 * Parse an isolated escape code, looking for "SelectGraphicsRendition" codes specifically.
 *
 * Result:
 * ```
 * // Supported code
 * {
 *     isSelectGraphicRendition: true,
 *     escapeCode: string, // input
 *     setFG: number | {palette256: number} | {rgb: {r, g, b}} | false,
 *     setBG: number | {palette256: number} | {rgb: {r, g, b}} | false,
 *     resetFG: bool, // true if contains a reset back to default foreground
 *     resetBG: bool // true if contains a reset back to default background
 * }
 *
 * // Unsupported or malformed code:
 * {
 *     isSelectGraphicRendition: false,
 *     escapeCode: string // input
 * }
 * ```
 */
export function parseEscapeCode(escapeCode: string): Result {
  // eslint-disable-next-line no-control-regex
  const graphicsPattern = /^\u001b\[([;0-9-]*)m$/; // We only care about SGR codes

  const result: Result = {
    isSelectGraphicRendition: false, // True when is a color / font command
    escapeCode,
  };

  const match = graphicsPattern.exec(escapeCode);

  if (match) {
    result.isSelectGraphicRendition = true;
    result.setFG = false;
    result.setBG = false;
    result.resetFG = false;
    result.resetBG = false;

    // Convert param string to array<int> with length > 1
    const params = (match[1] || "")
      .split(";")
      .map((str) => parseInt(str || "0"));

    // Now go through the ints, decode them into bg/fg info
    for (let i = 0; i < params.length; i++) {
      const num = params[i];

      if (num >= 30 && num <= 37) {
        result.setFG = num - 30; // Normal FG set
      } else if (num >= 40 && num <= 47) {
        result.setBG = num - 40; // Normal BG set
      } else if (num >= 90 && num <= 97) {
        result.setFG = num - 90 + 8; // Bright FG set
      } else if (num >= 100 && num <= 107) {
        result.setBG = num - 100 + 8; // Bright BG set
      } else if (num === 38) {
        // Extended foreground color
        if (i + 2 < params.length && params[i + 1] === 5) {
          // 256-color mode: ESC[38;5;n
          const colorIndex = params[i + 2];
          if (colorIndex >= 0 && colorIndex <= 255) {
            result.setFG = { palette256: colorIndex };
          } else {
            result.setFG = false; // Explicitly set to false for invalid values
          }
          i += 2; // Skip the next two parameters
        } else if (i + 1 < params.length && params[i + 1] === 2) {
          // True color mode: ESC[38;2;r;g;b
          if (i + 4 < params.length) {
            const r = params[i + 2];
            const g = params[i + 3];
            const b = params[i + 4];
            if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
              result.setFG = { rgb: { r, g, b } };
            } else {
              result.setFG = false; // Explicitly set to false for invalid values
            }
            i += 4; // Skip the next four parameters
          } else {
            result.setFG = false; // Not enough parameters
            i += Math.min(4, params.length - i - 1); // Skip available parameters
          }
        }
      } else if (num === 48) {
        // Extended background color
        if (i + 2 < params.length && params[i + 1] === 5) {
          // 256-color mode: ESC[48;5;n
          const colorIndex = params[i + 2];
          if (colorIndex >= 0 && colorIndex <= 255) {
            result.setBG = { palette256: colorIndex };
          } else {
            result.setBG = false; // Explicitly set to false for invalid values
          }
          i += 2; // Skip the next two parameters
        } else if (i + 1 < params.length && params[i + 1] === 2) {
          // True color mode: ESC[48;2;r;g;b
          if (i + 4 < params.length) {
            const r = params[i + 2];
            const g = params[i + 3];
            const b = params[i + 4];
            if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
              result.setBG = { rgb: { r, g, b } };
            } else {
              result.setBG = false; // Explicitly set to false for invalid values
            }
            i += 4; // Skip the next four parameters
          } else {
            result.setBG = false; // Not enough parameters
            i += Math.min(4, params.length - i - 1); // Skip available parameters
          }
        }
      } else {
        // Handle resets
        if (num === 39 || num === 0) {
          result.resetFG = true;
          result.setFG = false;
        }

        if (num === 49 || num === 0) {
          result.resetBG = true;
          result.setBG = false;
        }
      }
    }
  }

  return result;
}

/**
 * Break up a string into an array of plain strings and escape codes. Returns [input] if no codes present.
 */
export function tokenizeANSIString(input?: string): (string | Result)[] {
  if (typeof input !== "string") {
    return [];
  }

  const len = input.length;

  if (len === 0) {
    return [];
  }

  /*
    loopCounter         - Where should the next loop start looping for escape codes.
    escapeCodeIndex     - The index in the string of the next ANSI escape code or -1.
    parsedPointer       - The parse pointer how far in the string have we parsed.
                          This will === loopCounter unless there are commented ANSI escape characters.
    commentStartIndex   - The start index of the next comment block, or -1.
    commentEndIndex     - The end index of the next comment block, or -1.
  */
  let loopCounter = 0;
  let escapeCodeIndex = 0;
  let parsedPointer = 0;
  // comment start
  let commentStartIndex = 0;
  // comment end
  let commentEndIndex = 0;
  const result: (string | Result)[] = [];

  while (loopCounter < len) {
    //--------------------------------------------------------------------------
    //  Find next escape code
    escapeCodeIndex = input.indexOf("\x1b", loopCounter);

    if (escapeCodeIndex === -1) {
      // No more escape codes
      break;
    }

    // Check if escape code is commented
    commentStartIndex = input.indexOf("<!--", loopCounter);
    commentEndIndex = input.indexOf("-->", commentStartIndex);
    if (commentEndIndex !== -1) {
      commentEndIndex += 3;
    }
    if (
      escapeCodeIndex > commentStartIndex &&
      escapeCodeIndex < commentEndIndex
    ) {
      // Skip past the comment
      loopCounter = commentEndIndex;
      continue;
    }

    //--------------------------------------------------------------------------
    //  Capture any text between the start pointer and the escape code

    if (escapeCodeIndex > loopCounter) {
      result.push(input.substring(loopCounter, escapeCodeIndex));
      loopCounter = escapeCodeIndex; // Advance our start pointer to the beginning of the escape code
    }

    //--------------------------------------------------------------------------
    //  Find the end of the escape code (a char from 64 - 126 indicating command)

    escapeCodeIndex += 2; // Skip past ESC and '['

    let code = input.charCodeAt(escapeCodeIndex);
    while (escapeCodeIndex < len && (code < 64 || code > 126)) {
      escapeCodeIndex++;
      code = input.charCodeAt(escapeCodeIndex);
    }

    //--------------------------------------------------------------------------
    //  Create token for the escape code

    // TODO fix type checking
    const parsedEscapeCode: any = parseEscapeCode(
      input.substring(loopCounter, escapeCodeIndex + 1),
    );
    result.push(parsedEscapeCode);

    //--------------------------------------------------------------------------
    //  Keep looking in the rest of the string

    loopCounter = escapeCodeIndex + 1;
    // Move parsedPointer as we have processes the text to this point.
    parsedPointer = loopCounter;
  }

  if (parsedPointer < len) {
    result.push(input.substr(parsedPointer));
  }

  return result;
}

/**
 * Takes an array of string snippets and parsed escape codes produced by tokenizeANSIString, and creates
 * an array of strings and spans with classNames for attributes.
 */
export function makeReactChildren(
  tokenizedInput: (string | Result)[],
  key: string,
) {
  const result = [];
  let currentState: Result = {
    setFG: false,
    setBG: false,
  };

  for (let i = 0; i < tokenizedInput.length; i++) {
    const codeOrString = tokenizedInput[i];
    if (typeof codeOrString === "string") {
      // Need to output a <span> or plain text if there's no interesting current state
      const hasStyles = !!(
        currentState.setFG !== false ||
        currentState.setBG !== false
      );

      if (!hasStyles) {
        result.push(
          <div
            dangerouslySetInnerHTML={{ __html: codeOrString }}
            key={`${key}-${i}`}
          />,
        );
      } else {
        const classNames = [];
        const inlineStyles: React.CSSProperties = {};

        // Handle foreground colors
        if (typeof currentState.setFG === "number") {
          classNames.push(`ansi-fg-${currentState.setFG}`);
        } else if (currentState.setFG && typeof currentState.setFG === "object") {
          if ("palette256" in currentState.setFG) {
            classNames.push(`ansi-fg-256-${currentState.setFG.palette256}`);
          } else if ("rgb" in currentState.setFG) {
            const { r, g, b } = currentState.setFG.rgb;
            inlineStyles.color = `rgb(${r}, ${g}, ${b})`;
          }
        }

        // Handle background colors
        if (typeof currentState.setBG === "number") {
          classNames.push(`ansi-bg-${currentState.setBG}`);
        } else if (currentState.setBG && typeof currentState.setBG === "object") {
          if ("palette256" in currentState.setBG) {
            classNames.push(`ansi-bg-256-${currentState.setBG.palette256}`);
          } else if ("rgb" in currentState.setBG) {
            const { r, g, b } = currentState.setBG.rgb;
            inlineStyles.backgroundColor = `rgb(${r}, ${g}, ${b})`;
          }
        }

        result.push(
          <span
            className={classNames.length > 0 ? classNames.join(" ") : undefined}
            style={Object.keys(inlineStyles).length > 0 ? inlineStyles : undefined}
            key={`${key}-${i}`}
          >
            {codeOrString}
          </span>,
        );
      }
    } else if (codeOrString.isSelectGraphicRendition) {
      // Update the current FG / BG colors for the next text span
      const nextState = { ...currentState };

      if (codeOrString.resetFG) {
        nextState.setFG = false;
      }
      if (codeOrString.resetBG) {
        nextState.setBG = false;
      }

      if (codeOrString.setFG !== false) {
        nextState.setFG = codeOrString.setFG;
      }
      if (codeOrString.setBG !== false) {
        nextState.setBG = codeOrString.setBG;
      }

      currentState = nextState;
    }
  }

  return result;
}
