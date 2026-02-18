import { createFileRoute } from "@tanstack/react-router";

const SuccessPage = () => (
  <div className="container mx-auto px-4 py-8">
    <h1>Success</h1>
  </div>
);

export const Route = createFileRoute("/success")({
  component: SuccessPage,
});
