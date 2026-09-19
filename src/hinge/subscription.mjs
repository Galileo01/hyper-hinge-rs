/** Register events before fetching a snapshot; cleanup also covers pending registration. */
export function subscribeSnapshot(listen, snapshot, receive, onError) {
  let disposed = false;
  let unlisten;
  let events = 0;
  const ready = (async () => {
    try {
      unlisten = await listen((value) => {
        if (!disposed) {
          events++;
          receive(value);
        }
      });
      if (disposed) {
        unlisten();
        return;
      }
      const before = events;
      const initial = await snapshot();
      if (!disposed && events === before) receive(initial);
    } catch (error) {
      if (!disposed) onError(error);
    }
  })();
  return {
    ready,
    stop() {
      if (disposed) return;
      disposed = true;
      unlisten?.();
    },
  };
}
