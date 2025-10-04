/** * @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  makeReactChildren,
  parseEscapeCode,
  Result,
  tokenizeANSIString,
} from "./Ansi.tsx";

describe("ANSI Escape Code Parsing", () => {
  describe("parseEscapeCode", () => {
    it("should parse basic 8-color foreground codes", () => {
      const result = parseEscapeCode("\u001b[31m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setFG).toBe(1); // Red
      expect(result.setBG).toBe(false);
    });

    it("should parse basic 8-color background codes", () => {
      const result = parseEscapeCode("\u001b[42m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setFG).toBe(false);
      expect(result.setBG).toBe(2); // Green
    });

    it("should parse 256-color foreground codes (ESC[38;5;n)", () => {
      const result = parseEscapeCode("\u001b[38;5;196m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setFG).toEqual({ palette256: 196 }); // Bright red in 256-color palette
      expect(result.setBG).toBe(false);
    });

    it("should parse 256-color background codes (ESC[48;5;n)", () => {
      const result = parseEscapeCode("\u001b[48;5;21m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setBG).toEqual({ palette256: 21 }); // Blue in 256-color palette
      expect(result.setFG).toBe(false);
    });

    it("should parse true color foreground codes (ESC[38;2;r;g;b)", () => {
      const result = parseEscapeCode("\u001b[38;2;255;128;64m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setFG).toEqual({ rgb: { r: 255, g: 128, b: 64 } });
    });

    it("should parse true color background codes (ESC[48;2;r;g;b)", () => {
      const result = parseEscapeCode("\u001b[48;2;64;128;255m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setBG).toEqual({ rgb: { r: 64, g: 128, b: 255 } });
    });

    it("should parse foreground reset codes", () => {
      const result = parseEscapeCode("\u001b[39m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.resetFG).toBe(true);
      expect(result.setFG).toBe(false);
    });

    it("should parse background reset codes", () => {
      const result = parseEscapeCode("\u001b[49m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.resetBG).toBe(true);
      expect(result.setBG).toBe(false);
    });

    it("should parse global reset codes", () => {
      const result = parseEscapeCode("\u001b[0m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.resetFG).toBe(true);
      expect(result.resetBG).toBe(true);
    });

    it("should parse combined codes", () => {
      const result = parseEscapeCode("\u001b[31;42m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setFG).toBe(1); // Red foreground
      expect(result.setBG).toBe(2); // Green background
    });

    it("should handle invalid escape codes", () => {
      const result = parseEscapeCode("\u001b[999m");
      expect(result.isSelectGraphicRendition).toBe(true);
      expect(result.setFG).toBe(false);
      expect(result.setBG).toBe(false);
    });

    it("should reject malformed escape codes", () => {
      const result = parseEscapeCode("invalid");
      expect(result.isSelectGraphicRendition).toBe(false);
    });

    it("should validate RGB ranges for true color", () => {
      // Valid RGB values
      const validResult = parseEscapeCode("\u001b[38;2;255;255;255m");
      expect(validResult.setFG).toEqual({ rgb: { r: 255, g: 255, b: 255 } });

      // Invalid RGB values (out of range)
      const invalidResult = parseEscapeCode("\u001b[38;2;256;300;-1m");
      expect(invalidResult.setFG).toBe(false);
    });

    it("should validate 256-color index ranges", () => {
      // Valid 256-color index
      const validResult = parseEscapeCode("\u001b[38;5;255m");
      expect(validResult.setFG).toEqual({ palette256: 255 });

      // Invalid 256-color index (out of range)
      const invalidResult = parseEscapeCode("\u001b[38;5;256m");
      expect(invalidResult.setFG).toBe(false);
    });
  });

  describe("tokenizeANSIString", () => {
    it("should return empty array for undefined input", () => {
      const result = tokenizeANSIString(undefined);
      expect(result).toEqual([]);
    });

    it("should return empty array for empty string", () => {
      const result = tokenizeANSIString("");
      expect(result).toEqual([]);
    });

    it("should return plain string for input without escape codes", () => {
      const result = tokenizeANSIString("Hello, world!");
      expect(result).toEqual(["Hello, world!"]);
    });

    it("should tokenize string with ANSI escape codes", () => {
      const input = "Hello \u001b[31mRed\u001b[0m World";
      const result = tokenizeANSIString(input);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe("Hello ");
      expect(result[1]).toMatchObject({
        isSelectGraphicRendition: true,
        setFG: 1,
      });
      expect(result[2]).toBe("Red");
      expect(result[3]).toMatchObject({
        isSelectGraphicRendition: true,
        resetFG: true,
        resetBG: true,
      });
      expect(result[4]).toBe(" World");
    });

    it("should handle multiple consecutive escape codes", () => {
      const input = "\u001b[31m\u001b[42mText\u001b[0m";
      const result = tokenizeANSIString(input);

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        isSelectGraphicRendition: true,
        setFG: 1,
      });
      expect(result[1]).toMatchObject({
        isSelectGraphicRendition: true,
        setBG: 2,
      });
      expect(result[2]).toBe("Text");
      expect(result[3]).toMatchObject({
        isSelectGraphicRendition: true,
        resetFG: true,
        resetBG: true,
      });
    });

    it("should handle 256-color and true color codes", () => {
      const input =
        "\u001b[38;5;196mRed256\u001b[38;2;255;128;64mTrueColor\u001b[0m";
      const result = tokenizeANSIString(input);

      expect(result).toHaveLength(5);
      expect(result[0]).toMatchObject({
        isSelectGraphicRendition: true,
        setFG: { palette256: 196 },
      });
      expect(result[1]).toBe("Red256");
      expect(result[2]).toMatchObject({
        isSelectGraphicRendition: true,
        setFG: { rgb: { r: 255, g: 128, b: 64 } },
      });
      expect(result[3]).toBe("TrueColor");
      expect(result[4]).toMatchObject({
        isSelectGraphicRendition: true,
        resetFG: true,
        resetBG: true,
      });
    });
  });

  describe("makeReactChildren", () => {
    it("should create div elements for plain text without styling", () => {
      const tokens = ["Hello, world!"];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("div");
      expect(result[0].props.dangerouslySetInnerHTML.__html).toBe(
        "Hello, world!",
      );
    });

    it("should create span elements with basic color classes", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: 1,
          setBG: false,
          resetFG: false,
          resetBG: false,
        } as Result,
        "Red text",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("span");
      expect(result[0].props.className).toBe("ansi-fg-1");
      expect(result[0].props.children).toBe("Red text");
    });

    it("should create span elements with 256-color classes", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: { palette256: 196 },
          setBG: false,
          resetFG: false,
          resetBG: false,
        } as Result,
        "256-color text",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("span");
      expect(result[0].props.className).toBe("ansi-fg-256-196");
      expect(result[0].props.children).toBe("256-color text");
    });

    it("should create span elements with inline RGB styles for true color", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: { rgb: { r: 255, g: 128, b: 64 } },
          setBG: false,
          resetFG: false,
          resetBG: false,
        } as Result,
        "True color text",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("span");
      expect(result[0].props.style.color).toBe("rgb(255, 128, 64)");
      expect(result[0].props.children).toBe("True color text");
    });

    it("should handle combined foreground and background styles", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: 1,
          setBG: 2,
          resetFG: false,
          resetBG: false,
        } as Result,
        "Styled text",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("span");
      expect(result[0].props.className).toBe("ansi-fg-1 ansi-bg-2");
      expect(result[0].props.children).toBe("Styled text");
    });

    it("should reset styles properly", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: 1,
          setBG: false,
          resetFG: false,
          resetBG: false,
        } as Result,
        "Red text",
        {
          isSelectGraphicRendition: true,
          setFG: false,
          setBG: false,
          resetFG: true,
          resetBG: false,
        } as Result,
        "Normal text",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(2);

      // First span should have red foreground
      expect(result[0].type).toBe("span");
      expect(result[0].props.className).toBe("ansi-fg-1");
      expect(result[0].props.children).toBe("Red text");

      // Second element should be a div (no styling)
      expect(result[1].type).toBe("div");
      expect(result[1].props.dangerouslySetInnerHTML.__html).toBe(
        "Normal text",
      );
    });

    it("should prioritize true color over other color modes", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: { rgb: { r: 255, g: 128, b: 64 } },
          setBG: false,
          resetFG: false,
          resetBG: false,
        } as Result,
        "True color priority",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("span");
      expect(result[0].props.style.color).toBe("rgb(255, 128, 64)");
      expect(result[0].props.className).toBeUndefined();
    });

    it("should handle state transitions correctly", () => {
      const tokens: (string | Result)[] = [
        {
          isSelectGraphicRendition: true,
          setFG: 1,
          setBG: false,
          resetFG: false,
          resetBG: false,
        } as Result,
        "Red",
        {
          isSelectGraphicRendition: true,
          setFG: { palette256: 196 },
          setBG: 2,
          resetFG: false,
          resetBG: false,
        } as Result,
        "Mixed colors",
        {
          isSelectGraphicRendition: true,
          setFG: false,
          setBG: false,
          resetFG: true,
          resetBG: false,
        } as Result,
        "Background only",
      ];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(3);

      // First: red foreground
      expect(result[0].props.className).toBe("ansi-fg-1");

      // Second: 256-color foreground + basic background
      expect(result[1].props.className).toBe("ansi-fg-256-196 ansi-bg-2");

      // Third: background only (foreground reset)
      expect(result[2].props.className).toBe("ansi-bg-2");
    });

    it("should generate unique keys for each element", () => {
      const tokens = ["Text1", "Text2", "Text3"];
      const result = makeReactChildren(tokens, "test");

      expect(result).toHaveLength(3);
      expect(result[0].key).toBe("test-0");
      expect(result[1].key).toBe("test-1");
      expect(result[2].key).toBe("test-2");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complex ANSI string with multiple color modes", () => {
      const input =
        "Normal \u001b[31mRed \u001b[38;5;196m256-Red \u001b[38;2;255;128;64mTrue-Red\u001b[0m Normal";
      const tokens = tokenizeANSIString(input);
      const result = makeReactChildren(tokens, "complex");

      expect(result).toHaveLength(5);

      // Normal text
      expect(result[0].type).toBe("div");
      expect(result[0].props.dangerouslySetInnerHTML.__html).toBe("Normal ");

      // Basic red
      expect(result[1].type).toBe("span");
      expect(result[1].props.className).toBe("ansi-fg-1");
      expect(result[1].props.children).toBe("Red ");

      // 256-color red
      expect(result[2].type).toBe("span");
      expect(result[2].props.className).toBe("ansi-fg-256-196");
      expect(result[2].props.children).toBe("256-Red ");

      // True color red
      expect(result[3].type).toBe("span");
      expect(result[3].props.style.color).toBe("rgb(255, 128, 64)");
      expect(result[3].props.children).toBe("True-Red");

      // Reset to normal
      expect(result[4].type).toBe("div");
      expect(result[4].props.dangerouslySetInnerHTML.__html).toBe(" Normal");
    });

    it("should handle nested styling changes", () => {
      const input =
        "\u001b[31m\u001b[48;5;21mRed on Blue256\u001b[38;2;255;255;255m White on Blue256\u001b[0m";
      const tokens = tokenizeANSIString(input);
      const result = makeReactChildren(tokens, "nested");

      expect(result).toHaveLength(2);

      // Red foreground + 256-color blue background
      expect(result[0].props.className).toBe("ansi-fg-1 ansi-bg-256-21");
      expect(result[0].props.children).toBe("Red on Blue256");

      // True color white foreground + 256-color blue background
      expect(result[1].props.className).toBe("ansi-bg-256-21");
      expect(result[1].props.style.color).toBe("rgb(255, 255, 255)");
      expect(result[1].props.children).toBe(" White on Blue256");
    });
  });
});
