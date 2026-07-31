import { createFileRoute } from "@tanstack/react-router";
import { NotebookApp } from "@/components/notebook/NotebookApp";

export const Route = createFileRoute("/c/$chatId")({
  head: () => ({
    meta: [
      { title: "My Notebook · Doubtbook" },
      {
        name: "description",
        content:
          "Your handwritten AI notebook: step-by-step solutions, colourful notes and circle-to-ask doubts.",
      },
      { property: "og:title", content: "My Notebook · Doubtbook" },
      {
        property: "og:description",
        content: "Step-by-step solutions written by hand on ruled notebook pages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { chatId } = Route.useParams();
  return <NotebookApp key={chatId} chatId={chatId} />;
}
