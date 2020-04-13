import { useRef } from 'react';

export const useWhatChanged = (props: Record<string, any>) => {
  const nRender = useRef(0);
  const oldPropsChanged = useRef<Record<string, any>>(props);

  console.log('render', ++nRender.current);
  for (const [propName, newProp] of Object.entries(props)) {
    if (oldPropsChanged.current[propName] !== newProp) {
      console.log(
        `${propName} changed from`,
        oldPropsChanged.current[propName],
        'to',
        newProp
      );
    }
  }
  oldPropsChanged.current = props;
};
