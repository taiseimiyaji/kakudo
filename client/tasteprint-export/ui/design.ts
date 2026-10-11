import type { Design } from './domain/design';
export const design: Design = {
  "canvas": "#f8f8f4",
  "surface": "#ffffff",
  "ink": "#282c25",
  "muted": "#6c7164",
  "borderColor": "#e9e9e3",
  "success": "#327554",
  "warning": "#946500",
  "danger": "#b34040",
  "focus": "#526f99",
  "fontFamily": "sans-serif",
  "heading1": 28,
  "heading2": 22,
  "heading3": 18,
  "lineHeight": 1.5,
  "bodyWeight": 400,
  "headingWeight": 600,
  "spacingScale": [
    0,
    4,
    8,
    12,
    16,
    24,
    32,
    48
  ],
  "pagePadding": 24,
  "sectionGap": 24,
  "controlHeight": 36,
  "rowHeight": 48,
  "radiusNone": 0,
  "radiusXs": 2,
  "radiusSm": 4,
  "radiusLg": 12,
  "radiusPill": 9999,
  "radiusUsage": "md: 面、sm: コントロール、pill: バッジ",
  "borderWidth": 1,
  "borderPolicy": "一覧の行を区切る",
  "shadowX": 0,
  "shadowY": 5,
  "shadowBlur": 18,
  "shadowSpread": 0,
  "shadowColor": "#222222",
  "shadowOpacity": 0.08,
  "shadowAllowed": "Dialog、Popover",
  "duration": 160,
  "easing": "ease-out",
  "reducedMotion": "none",
  "compactBreakpoint": 480,
  "mediumBreakpoint": 768,
  "wideBreakpoint": 1200,
  "compactPolicy": "ナビゲーションを畳み、テーブルを横スクロール",
  "mediumPolicy": "ナビゲーションを畳む",
  "widePolicy": "サイドバーと本文を横並び",
  "components": {
    "Button": {
      "variant": "solid",
      "size": "md",
      "states": [
        "default",
        "hover",
        "focus",
        "disabled",
        "loading"
      ],
      "usage": "Buttonの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Input": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default",
        "hover",
        "focus",
        "disabled",
        "error"
      ],
      "usage": "Inputの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Select": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default",
        "hover",
        "focus",
        "disabled",
        "error"
      ],
      "usage": "Selectの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Checkbox": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default",
        "hover",
        "focus",
        "disabled",
        "error"
      ],
      "usage": "Checkboxの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Tabs": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default",
        "hover",
        "focus",
        "disabled"
      ],
      "usage": "Tabsの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Dialog": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default",
        "focus"
      ],
      "usage": "Dialogの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Table": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default",
        "loading"
      ],
      "usage": "Tableの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    },
    "Badge": {
      "variant": "outline",
      "size": "md",
      "states": [
        "default"
      ],
      "usage": "Badgeの標準的な操作・表示",
      "rules": "ラベルとフォーカスを明確にする",
      "rationale": "一貫した操作と読みやすさを保つ"
    }
  },
  "patterns": {
    "PageHeader": {
      "structure": [
        "title",
        "action"
      ],
      "gap": 16,
      "components": [
        "Button"
      ],
      "responsive": "stack",
      "usage": "PageHeaderで情報と操作をまとめる",
      "avoid": "操作と無関係な情報を混在させない",
      "rationale": "情報の順序と余白で構造を伝える"
    },
    "FilterBar": {
      "structure": [
        "tabs",
        "search",
        "filter"
      ],
      "gap": 16,
      "components": [
        "Tabs",
        "Input",
        "Select"
      ],
      "responsive": "stack",
      "usage": "FilterBarで情報と操作をまとめる",
      "avoid": "操作と無関係な情報を混在させない",
      "rationale": "情報の順序と余白で構造を伝える"
    },
    "ListPage": {
      "structure": [
        "PageHeader",
        "FilterBar",
        "Table",
        "EmptyState"
      ],
      "gap": 16,
      "components": [
        "Table",
        "Badge"
      ],
      "responsive": "stack",
      "usage": "ListPageで情報と操作をまとめる",
      "avoid": "操作と無関係な情報を混在させない",
      "rationale": "情報の順序と余白で構造を伝える"
    },
    "SettingsSection": {
      "structure": [
        "fields",
        "save",
        "danger"
      ],
      "gap": 16,
      "components": [
        "Input",
        "Select",
        "Checkbox",
        "Button",
        "Dialog"
      ],
      "responsive": "stack",
      "usage": "SettingsSectionで情報と操作をまとめる",
      "avoid": "操作と無関係な情報を混在させない",
      "rationale": "情報の順序と余白で構造を伝える"
    },
    "FormSection": {
      "structure": [
        "fields",
        "submit",
        "help"
      ],
      "gap": 16,
      "components": [
        "Input",
        "Select",
        "Checkbox",
        "Button"
      ],
      "responsive": "stack",
      "usage": "FormSectionで情報と操作をまとめる",
      "avoid": "操作と無関係な情報を混在させない",
      "rationale": "情報の順序と余白で構造を伝える"
    },
    "EmptyState": {
      "structure": [
        "message",
        "action"
      ],
      "gap": 16,
      "components": [
        "Button"
      ],
      "responsive": "stack",
      "usage": "EmptyStateで情報と操作をまとめる",
      "avoid": "操作と無関係な情報を混在させない",
      "rationale": "情報の順序と余白で構造を伝える"
    }
  },
  "constraints": {},
  "accent": "#65764d",
  "radius": 6,
  "spacing": 14,
  "fontSize": 14,
  "border": true,
  "shadow": false
}
;
