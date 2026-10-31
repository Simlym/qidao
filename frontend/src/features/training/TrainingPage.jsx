import React from "react";
import Trainer from "./Trainer";
import ConnectedAccountGate from "../../shared/ui/ConnectedAccountGate";

export default function TrainingPage(props) {
  return <ConnectedAccountGate user={props.user} onRequireLogin={props.onRequireLogin} title="题库训练">
    <Trainer key={props.user?.username} {...props} />
  </ConnectedAccountGate>;
}
