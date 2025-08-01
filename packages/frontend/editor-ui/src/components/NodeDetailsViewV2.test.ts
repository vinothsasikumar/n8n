import { createPinia, setActivePinia } from 'pinia';
import { waitFor, waitForElementToBeRemoved, fireEvent } from '@testing-library/vue';
import { mock } from 'vitest-mock-extended';

import NodeDetailsViewV2 from '@/components/NodeDetailsViewV2.vue';
import { VIEWS } from '@/constants';
import type { IWorkflowDb } from '@/Interface';
import { useSettingsStore } from '@/stores/settings.store';
import { useUsersStore } from '@/stores/users.store';
import { useNDVStore } from '@/stores/ndv.store';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';
import { useWorkflowsStore } from '@/stores/workflows.store';

import { createComponentRenderer } from '@/__tests__/render';
import { setupServer } from '@/__tests__/server';
import { defaultNodeDescriptions, mockNodes } from '@/__tests__/mocks';
import { cleanupAppModals, createAppModals } from '@/__tests__/utils';

vi.mock('vue-router', () => {
	return {
		useRouter: () => ({}),
		useRoute: () => ({ meta: {} }),
		RouterLink: vi.fn(),
	};
});

async function createPiniaStore(
	{ activeNodeName }: { activeNodeName: string | null } = { activeNodeName: null },
) {
	const workflow = mock<IWorkflowDb>({
		connections: {},
		active: true,
		nodes: mockNodes,
	});

	const pinia = createPinia();
	setActivePinia(pinia);

	const workflowsStore = useWorkflowsStore();
	const nodeTypesStore = useNodeTypesStore();
	const ndvStore = useNDVStore();

	nodeTypesStore.setNodeTypes(defaultNodeDescriptions);
	workflowsStore.workflow = workflow;
	workflowsStore.nodeMetadata = mockNodes.reduce(
		(acc, node) => ({ ...acc, [node.name]: { pristine: true } }),
		{},
	);

	ndvStore.activeNodeName = activeNodeName;

	await useSettingsStore().getSettings();
	await useUsersStore().loginWithCookie();

	return {
		pinia,
		currentWorkflow: workflowsStore.getCurrentWorkflow(),
	};
}

describe('NodeDetailsViewV2', () => {
	let server: ReturnType<typeof setupServer>;

	beforeAll(() => {
		HTMLDialogElement.prototype.show = vi.fn();
		server = setupServer();
	});

	beforeEach(() => {
		createAppModals();
	});

	afterEach(() => {
		cleanupAppModals();
		vi.clearAllMocks();
	});

	afterAll(() => {
		server.shutdown();
	});

	test('should render correctly', async () => {
		const { pinia, currentWorkflow } = await createPiniaStore({ activeNodeName: 'Manual Trigger' });

		const renderComponent = createComponentRenderer(NodeDetailsViewV2, {
			props: {
				teleported: false,
				appendToBody: false,
				workflowObject: currentWorkflow,
			},
			global: {
				mocks: {
					$route: {
						name: VIEWS.WORKFLOW,
					},
				},
			},
		});

		const { getByTestId } = renderComponent({
			pinia,
		});

		await waitFor(() => expect(getByTestId('ndv')).toBeInTheDocument());
	});

	test('should not render for stickies', async () => {
		const { pinia, currentWorkflow } = await createPiniaStore({ activeNodeName: 'Sticky' });

		const renderComponent = createComponentRenderer(NodeDetailsViewV2, {
			props: {
				teleported: false,
				appendToBody: false,
				workflowObject: currentWorkflow,
			},
			global: {
				mocks: {
					$route: {
						name: VIEWS.WORKFLOW,
					},
				},
			},
		});

		const { queryByTestId } = renderComponent({
			pinia,
		});

		expect(queryByTestId('ndv')).not.toBeInTheDocument();
	});

	describe('keyboard listener', () => {
		test('should register and unregister keydown listener based on modal open state', async () => {
			const { pinia, currentWorkflow } = await createPiniaStore();
			const ndvStore = useNDVStore();

			const renderComponent = createComponentRenderer(NodeDetailsViewV2, {
				props: {
					teleported: false,
					appendToBody: false,
					workflowObject: currentWorkflow,
				},
				global: {
					mocks: {
						$route: {
							name: VIEWS.WORKFLOW,
						},
					},
				},
			});

			const { getByTestId, queryByTestId } = renderComponent({
				pinia,
			});

			const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
			const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

			ndvStore.activeNodeName = 'Manual Trigger';

			await waitFor(() => expect(getByTestId('ndv')).toBeInTheDocument());

			expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
			expect(removeEventListenerSpy).not.toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
				true,
			);

			ndvStore.activeNodeName = null;

			await waitForElementToBeRemoved(queryByTestId('ndv'));

			expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);

			addEventListenerSpy.mockRestore();
			removeEventListenerSpy.mockRestore();
		});

		test('should unregister keydown listener on unmount', async () => {
			const { pinia, currentWorkflow } = await createPiniaStore();
			const ndvStore = useNDVStore();

			const renderComponent = createComponentRenderer(NodeDetailsViewV2, {
				props: {
					teleported: false,
					appendToBody: false,
					workflowObject: currentWorkflow,
				},
				global: {
					mocks: {
						$route: {
							name: VIEWS.WORKFLOW,
						},
					},
				},
			});

			const { getByTestId, unmount } = renderComponent({
				pinia,
			});

			ndvStore.activeNodeName = 'Manual Trigger';

			await waitFor(() => expect(getByTestId('ndv')).toBeInTheDocument());

			const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
			expect(removeEventListenerSpy).not.toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
				true,
			);

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);

			removeEventListenerSpy.mockRestore();
		});

		test("should emit 'saveKeyboardShortcut' when save shortcut keybind is pressed", async () => {
			const { pinia, currentWorkflow } = await createPiniaStore();
			const ndvStore = useNDVStore();

			const renderComponent = createComponentRenderer(NodeDetailsViewV2, {
				props: {
					teleported: false,
					appendToBody: false,
					workflowObject: currentWorkflow,
				},
				global: {
					mocks: {
						$route: {
							name: VIEWS.WORKFLOW,
						},
					},
				},
			});

			const { getByTestId, emitted } = renderComponent({
				pinia,
			});

			ndvStore.activeNodeName = 'Manual Trigger';

			await waitFor(() => expect(getByTestId('ndv')).toBeInTheDocument());

			await fireEvent.keyDown(getByTestId('ndv'), {
				key: 's',
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});

			expect(emitted().saveKeyboardShortcut).toBeTruthy();
		});
	});
});
