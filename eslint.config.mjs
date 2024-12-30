import pluginJs from "@eslint/js";
import html from "eslint-plugin-html";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        files: ["**/*.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                RED: "readonly",
            },
        },
    },
    {
        files: ["**/*.html"],
        plugins: { html },
        languageOptions: {
            sourceType: "script",
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            "no-prototype-builtins": 0,
        },
    },
    {
        languageOptions: {
            globals: {
                RED: "readonly",
                $: "readonly",
                jQuery: "readonly",
            },
        },
    },
    pluginJs.configs.recommended,
];
