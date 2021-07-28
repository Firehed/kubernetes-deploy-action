import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

type DeploymentStatusStates =
  | 'error'
  | 'failure'
  | 'inactive'
  | 'in_progress'
  | 'queued'
  | 'pending'
  | 'success'

async function run(): Promise<void> {
  try {
    await core.group('Check environment setup', envCheck)
    // await envCheck()
    // @ts-ignore
    const deploymentId = await core.group('Set up Github deployment', createDeployment)
    await core.group('Deploy', deploy)
    await core.group('Update status', async () => post(deploymentId))
  } catch (error) {
    // update to failed?
    core.setFailed(error.message)
  }
}

async function envCheck(): Promise<void> {
  core.debug(JSON.stringify(process.env))
  // Check that kubectl is available
  await exec.exec('kubectl version')
  await exec.exec('kubectl config get-contexts')
  // check that it can talk to the cluster?
  // try to provide helpful messages if not in a usable state
}

async function createDeployment(): Promise<number> {
  const token = core.getInput('token')
  const ok = github.getOctokit(token)

  const params = {
    // FIXME: this is wrong, probably normal sha thing
    ref: github.context.ref,
    environment: 'production',
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  }
  const deploy = await ok.rest.repos.createDeployment(params)
  core.debug(JSON.stringify(deploy))

  // @ts-ignore
  const deploymentId: number = deploy.data.id

  updateStatus(deploymentId, 'pending')

  return deploymentId
}
async function deploy(): Promise<void> {
  const args = [
    'set',
    'image',
    'deployment',
  ]

  const namespace = core.getInput('namespace')
  if (namespace !== '') {
    args.push(`--namespace=${namespace}`)
  }

  const deployment = core.getInput('deployment')
  args.push(deployment)

  const container = core.getInput('container')
  const image = core.getInput('image')
  args.push(`${container}=${image}`)

  args.push('--record=true')

  await exec.exec('kubectl', args)
}

async function post(deploymentId: number): Promise<void> {
  // watch and wait?
  updateStatus(deploymentId, 'success')
}

async function updateStatus(deploymentId: number, state: DeploymentStatusStates) {
  const token = core.getInput('token')
  const ok = github.getOctokit(token)
  const params = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    deployment_id: deploymentId,
    state,
  }
  const result = await ok.rest.repos.createDeploymentStatus(params)
  console.debug(JSON.stringify(result))

}

run()
