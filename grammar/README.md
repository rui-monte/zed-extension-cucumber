# Gherkin grammar

Vendored from [binhtran432k/tree-sitter-gherkin](https://github.com/binhtran432k/tree-sitter-gherkin/tree/1a709aebeecbe81bd70dfd6ea784894844be1511), at commit `1a709aebeecbe81bd70dfd6ea784894844be1511` (MIT, Binh Tran).

The parser and grammar are unchanged. The dialect table is generated from the pinned official `@cucumber/gherkin` package by `node scripts/generate-dialects.cjs`. This fixes empty/duplicate prefix branches that prevent Portuguese `Cenário` and `Cenario` from being recognized. The table indexes use 16 bits, and trie lookup checks leaf and array bounds.

The extension manifest pins this directory to a published commit of this repository, so Zed can build the grammar using its normal extension installer. The Node tests parse the compiled WASM grammar and validate Zed's queries and all official scenario keyword aliases.

To regenerate `src/parser.c` after a grammar change, use Tree-sitter CLI 0.25.10 with ABI 14. Dialect-only changes do not require regenerating the parser.
