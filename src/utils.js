import moment from 'moment';
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

export function leftSpace(str, comma = false, prepend = '') {
  return str ? `${comma ? ', ' : ' '}${prepend}${str}` : '';
}

export function rightSpace(str, comma = false, prepend = '') {
  return str ? `${prepend}${str}${comma ? ', ' : ' '}` : '';
}

export function bothSpace(str) {
  return str ? ` ${str} ` : '';
}

export function truncDateString(str) {
  return str ? moment(str, 'DD.MM.YYYY').format('DD.MM.YYYY') : '';
}

export function toISODateString(str) {
  return str ? moment(str, 'DD.MM.YYYY HH:mm:ss').toISOString() : '';
}

export function joinStrings(arrStr, separator = ', ') {
  return arrStr.filter(str => typeof str === 'string' && str.trim() !== '').join(separator);
}

export function dateStringEqual(obj1, obj2) {
  if (moment(obj1, 'DD.MM.YYYY', true).isValid() && moment(obj2, 'DD.MM.YYYY 00:00:00', true).isValid()) {
    return (moment(obj1, 'DD.MM.YYYY').isSame(moment(obj2, 'DD.MM.YYYY')));
  }
  if (moment(obj2, 'DD.MM.YYYY', true).isValid() && moment(obj1, 'DD.MM.YYYY 00:00:00', true).isValid()) {
    return (moment(obj2, 'DD.MM.YYYY').isSame(moment(obj1, 'DD.MM.YYYY')));
  }
}

export function plurals(n, opts) {
  return opts[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
}
