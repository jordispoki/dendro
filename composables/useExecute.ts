export function useExecute() {
  async function runCommand(command: string, cwd?: string, hostId?: string, conversationId?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return await $fetch('/api/execute', {
      method: 'POST',
      body: { command, cwd, hostId, conversationId },
    })
  }

  return { runCommand }
}
