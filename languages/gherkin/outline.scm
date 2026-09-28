(feature
  (feature_header
    (feature_line (feature_kw) @context (context)? @name))) @item

(rule
  (rule_header
    (rule_line (rule_kw) @context (context)? @name))) @item

(background
  (background_line (background_kw) @context (context)? @name)) @item

(scenario
  [(scenario_line (scenario_kw) @context (context)? @name)
   (scenario_outline_line (scenario_outline_kw) @context (context)? @name)]) @item

(examples
  (examples_line (examples_kw) @context (context)? @name)) @item
