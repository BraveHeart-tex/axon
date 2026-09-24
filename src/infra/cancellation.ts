type Cleanup = () => Promise<void>;

type Registration = { controller: AbortController; cleanup: Cleanup };

let active: Registration | undefined;

export const registerCancellation = (cleanup: Cleanup) => {
  const registration: Registration = { controller: new AbortController(), cleanup };
  active = registration;

  return {
    signal: registration.controller.signal,
    unregister: () => {
      if (active === registration) active = undefined;
    },
  };
};

const runCancellation = async () => {
  const registration = active;
  if (!registration) return;

  active = undefined;
  registration.controller.abort();
  await registration.cleanup();
};

type InterruptHandlerOptions = {
  exit?: (code: number) => void;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

export const createInterruptHandler = ({
  exit = (code) => process.exit(code),
  stdout = (text) => process.stdout.write(text),
  stderr = (text) => process.stderr.write(text),
}: InterruptHandlerOptions = {}) => {
  let interrupting = false;

  return async () => {
    if (interrupting) {
      exit(130);
      return;
    }

    interrupting = true;
    stdout('\n');

    if (!active) {
      stdout('Interrupted. Exiting…\n');
      exit(1);
      return;
    }

    stdout('Interrupted. Cleaning up - press Ctrl+C again to exit immediately.\n');

    try {
      await runCancellation();
    } catch (error) {
      stderr(`Cleanup failed: ${(error as Error).message}\n`);
    }

    exit(130);
  };
};
