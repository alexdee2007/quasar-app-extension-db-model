import { pickBy, isNull, mapValues, keyBy } from 'lodash';
import store from 'store';

export const filterId = (obj) => pickBy(obj, (v, k) => k !== 'id');

export const equalBlank = (a, b) => (isNull(a) || a === '') && (isNull(b) || b === '') ? true : undefined;

export const getDictValue = (key, dict, language = 'UK') => {
  const v = store.getters.DICT(`${dict}&language=${language}`).find(v => v.key === key);
  return v ? v.value : key;
}

export const forceNextTick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));

export const mapValuesAsync = (obj, asyncFn) => {
  const promises = Object.keys(obj).map(key => asyncFn(obj[key], key).then(value => ({key, value})));
  return Promise.all(promises).then(values => mapValues(keyBy(values, 'key'), 'value'));
};