import { Preview } from '../components/Preview';
import { design } from '../design';
import '../styles.css';
export function ListPage() { return <Preview design={design} screen="list" />; }
export function SettingsPage() { return <Preview design={design} screen="settings" />; }
export function FormPage() { return <Preview design={design} screen="form" />; }
