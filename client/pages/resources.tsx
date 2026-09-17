import { Link, useParams } from "@tanstack/react-router";
import { ResourcePanel } from "../../components/resources/resource-panel";
export default function ResourcesPage() { const { workspaceId = "default" } = useParams({ strict: false }); return <main className="workspace"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← Knowledge Map</Link><h1>Workspace Resources</h1><ResourcePanel workspaceId={workspaceId} /></main>; }
