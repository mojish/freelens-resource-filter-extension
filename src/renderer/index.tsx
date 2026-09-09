/**
 * Renderer entry: registers the Resource Filter cluster page and sidebar menu.
 */

import { Renderer } from "@freelensapp/extensions";
import { ErrorBoundary } from "./components/error-boundary";
import { ResourceFilterPage } from "./components/resource-filter-page";

export default class ResourceFilterRenderer extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "resource-filter",
      components: {
        Page: () => (
          <ErrorBoundary>
            <ResourceFilterPage />
          </ErrorBoundary>
        ),
      },
    },
  ];

  clusterPageMenus = [
    {
      id: "resource-filter",
      title: "Resource Filter",
      target: { pageId: "resource-filter" },
      // built-in sidebar items: Favorites=0, Cluster=10, Nodes=20, …
      // sit right below "Cluster" so the page is easy to find
      orderNumber: 15,
      components: {
        Icon: FilterIcon,
      },
    },
  ];
}

function FilterIcon(props: Renderer.Component.IconProps) {
  return <Renderer.Component.Icon {...props} material="filter_list" />;
}
