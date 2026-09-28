[
  (feature_kw)
  (background_kw)
  (rule_kw)
  (scenario_kw)
  (scenario_outline_kw)
  (examples_kw)
  (given_kw)
  (when_kw)
  (then_kw)
  (and_kw)
  (but_kw)
  "* "
] @keyword

(comment) @comment
(language) @comment
(language_name) @string
(tag) @label
(step_param) @variable
(table_cell) @string
(table_head_row (table_col (table_cell) @attribute))
(doc_string) @string
(media_type) @type
[":" "|"] @punctuation.delimiter
["\"\"\"" "```"] @punctuation.special
