"use client";

import { useCallback, useEffect, useRef } from "react";
import { DockviewReact } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import GenerationForm from "./GenerationForm";
import ResultPanel from "./ResultPanel";

const GenerationFormPanel = (props) => <GenerationForm {...props.params} />;
const ResultPanelPanel = (props) => <ResultPanel {...props.params} />;

const components = {
  generationForm: GenerationFormPanel,
  resultPanel: ResultPanelPanel,
};

export default function DockableWorkspace(props) {
  const apiRef = useRef(null);

  const onReady = useCallback((event) => {
    apiRef.current = event.api;

    event.api.addPanel({
      id: "generationForm",
      component: "generationForm",
      title: props.t.inputImages,
      params: props,
    });

    event.api.addPanel({
      id: "resultPanel",
      component: "resultPanel",
      title: props.t.result,
      params: props,
      position: {
        direction: "right",
        referencePanel: "generationForm",
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repousse les props les plus recentes vers chaque panneau a chaque
  // changement (poseAUrl, genStatus, etc.), car onReady ne s'execute
  // qu'une seule fois a la creation.
  useEffect(() => {
    if (!apiRef.current) return;

    const formPanel = apiRef.current.getPanel("generationForm");
    const resultPanel = apiRef.current.getPanel("resultPanel");

    formPanel?.api.updateParameters(props);
    resultPanel?.api.updateParameters(props);
  });

  return (
    <div className="flex-1" style={{ height: "calc(100vh - 43px)", width: "100%" }}>
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-light"
      />
      <style jsx global>{`
        .dockview-theme-light {
          --dv-tabs-and-actions-container-background-color: var(--k-tab);
          --dv-activegroup-visiblepanel-tab-background-color: var(--k-canvas);
          --dv-activegroup-hiddenpanel-tab-background-color: var(--k-tab);
          --dv-inactivegroup-visiblepanel-tab-background-color: var(--k-canvas);
          --dv-inactivegroup-hiddenpanel-tab-background-color: var(--k-tab);
          --dv-tab-divider-color: var(--k-border-strong);
          --dv-group-view-background-color: var(--k-canvas);
          --dv-separator-border: var(--k-border-strong);
          --dv-activegroup-visiblepanel-tab-color: var(--k-text);
          --dv-activegroup-hiddenpanel-tab-color: var(--k-text-secondary);
          --dv-inactivegroup-visiblepanel-tab-color: var(--k-text-secondary);
          --dv-inactivegroup-hiddenpanel-tab-color: var(--k-muted);
        }
      `}</style>
    </div>
  );
}
