import { chooseMove } from '/ai.js';
self.onmessage = ({ data }) => {
  try { self.postMessage(chooseMove(data.state, data.level)); }
  catch (error) { self.postMessage({ error: error.message }); }
};
