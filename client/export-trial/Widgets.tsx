import { useState } from "react";
import { Button, Input, RuntimeDialog, RuntimeTabs, RuntimeTheme, Select } from "../tasteprint-export/ui";
import { design } from "../tasteprint-export/ui/design";

// Representative controls only: this form never writes Kakudo documents or APIs.
export default function Widgets() {
  const [submits, setSubmits] = useState(0), [open, setOpen] = useState(false), [disabled, setDisabled] = useState(false), [view, setView] = useState("All projects");
  return <RuntimeTheme design={design}><section style={{ padding: 16, minWidth: 0 }}>
    <h2>Export 部品比較</h2>
    <form aria-label="Export comparison form" onSubmit={event => { event.preventDefault(); setSubmits(n => n + 1); }}>
      <label>Name<Input required defaultValue="日本語の比較用ノート" data-component="Input" /></label>
      <label>Status<Select data-component="Select"><option>Planned</option><option>Done</option></Select></label>
      <label><input type="checkbox" checked={disabled} onChange={e => setDisabled(e.target.checked)} />Disable tabs</label>
      <RuntimeTabs disabled={disabled} onChange={setView} />
      <output aria-label="Selected view">{view}</output>
      <Button type="button" data-component="Button" onClick={() => setOpen(true)}>Open confirmation</Button>
      <RuntimeDialog open={open} close={() => setOpen(false)}><label>Confirmation note<Input defaultValue="Keep my draft" /></label><Button type="button" disabled>Disabled action</Button></RuntimeDialog>
      <Button type="submit" data-component="Button">Save comparison</Button>
      <output aria-label="Submit count">{submits}</output>
    </form>
  </section></RuntimeTheme>;
}
