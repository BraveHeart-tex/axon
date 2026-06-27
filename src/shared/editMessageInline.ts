import readline from 'node:readline';

export const editMessageInline = ({
  initialText,
  prompt,
}: {
  initialText?: string;
  prompt: string;
}): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt,
      terminal: true,
    });

    rl.on('SIGINT', () => {
      rl.close();
      process.exit(0);
    });

    rl.once('line', (line) => {
      rl.close();
      resolve(line.trim());
    });

    rl.prompt(true);
    rl.write(initialText ?? '');
  });
