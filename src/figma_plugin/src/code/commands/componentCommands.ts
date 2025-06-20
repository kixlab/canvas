export async function getLocalComponents() {
  await figma.loadAllPagesAsync();

  const components = figma.root.findAllWithCriteria({
    types: ['COMPONENT'],
  });

  return {
    count: components.length,
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      key: 'key' in component ? component.key : null,
    })),
  };
}

export async function createComponentInstance(params: {
  componentKey: string;
  x?: number;
  y?: number;
}) {
  const { componentKey, x = 0, y = 0 } = params || {};
  if (!componentKey) {
    throw new Error('Missing componentKey parameter');
  }
  // Use importComponentByKeyAsync and createInstance
  const component = await figma.importComponentByKeyAsync(componentKey);
  const instance = component.createInstance();

  instance.x = x;
  instance.y = y;
  figma.currentPage.appendChild(instance);

  return {
    id: instance.id,
    name: instance.name,
    x: instance.x,
    y: instance.y,
    width: instance.width,
    height: instance.height,
    componentId: instance.mainComponent?.id,
  };
}
