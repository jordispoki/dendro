export function useExecute() {
  async function runCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return await $fetch('/api/execute', {
      method: 'POST',
      body: { command, cwd },
    })
  }

  return { runCommand }
}
