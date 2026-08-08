package io.xaiop.stream;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Package-private async drain / executor plumbing for {@link DotCheckpointEngine}.
 *
 * <p>{@code lock} must be the engine instance so drain work shares the same monitor as public
 * {@code synchronized} API methods.
 */
final class CheckpointAsync {
  private ScheduledExecutorService executor;
  private CompletableFuture<Void> asyncDrainPromise;
  private boolean asyncDrainCancelled;

  CompletableFuture<Void> drainPromise() {
    return asyncDrainPromise;
  }

  CompletableFuture<Void> scheduleDrain(Object lock, Runnable underLock) {
    if (asyncDrainPromise != null) return asyncDrainPromise;
    CompletableFuture<Void> promise = new CompletableFuture<>();
    asyncDrainPromise = promise;
    asyncDrainCancelled = false;
    executor()
        .schedule(
            () -> {
              RuntimeException failure = null;
              synchronized (lock) {
                boolean cancelled = asyncDrainCancelled;
                asyncDrainPromise = null;
                asyncDrainCancelled = false;
                if (!cancelled) {
                  try {
                    underLock.run();
                  } catch (RuntimeException e) {
                    failure = e;
                  }
                }
              }
              if (failure != null) promise.completeExceptionally(failure);
              else promise.complete(null);
            },
            0,
            TimeUnit.MILLISECONDS);
    return promise;
  }

  void schedule(Runnable task) {
    executor().schedule(task, 0, TimeUnit.MILLISECONDS);
  }

  void cancelPending() {
    if (asyncDrainPromise != null) asyncDrainCancelled = true;
  }

  private ScheduledExecutorService executor() {
    if (executor == null) {
      executor =
          Executors.newSingleThreadScheduledExecutor(
              r -> {
                Thread t = new Thread(r, "xaiop-checkpoint");
                t.setDaemon(true);
                return t;
              });
    }
    return executor;
  }

  void shutdown() {
    ScheduledExecutorService pool;
    synchronized (this) {
      pool = executor;
      executor = null;
    }
    if (pool != null) pool.shutdown();
  }

  static CompletableFuture<Void> failed(RuntimeException error) {
    CompletableFuture<Void> f = new CompletableFuture<>();
    f.completeExceptionally(error);
    return f;
  }
}
