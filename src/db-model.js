import Vue from 'vue';
import { pickBy, mapValues, isEqualWith, isNull, cloneDeep, assignWith, assign, merge, flatten, difference, isEmpty } from 'lodash';
import { decimal, email, ipAddress, macAddress } from 'vuelidate/lib/validators';

import store from 'store';
import API from 'db-api';
import { joinStrings, truncDateString } from 'utils/strings';
import { date, datetime, isArray } from 'utils/validators';

const filterId = (obj) => pickBy(obj, (v, k) => k !== 'id');

const equalBlank = (a, b) => (isNull(a) || a === '') && (isNull(b) || b === '') ? true : undefined;

const getDictValue = (key, dict, language = 'UK') => {
  const v = store.getters.DICT(`${dict}&language=${language}`).find(v => v.key === key);
  return v ? v.value : key;
}

const vm = Vue.extend({

  props: {
    data: Object
  },

  data() {
    return mapValues(cloneDeep(this.data), (v, k) => this.__normalizeVm(v, k));
  },

  computed: {
    $isChanged() {
      return !isEqualWith(this.data, this.$jsonData, equalBlank);
    },
    $isEmpty() {
      return isEqualWith(filterId(this.$options.defaults()), filterId(this.$data), equalBlank);
    },
    $isClear() {
      return isEqualWith(this.$options.defaults(), this.$data, equalBlank);
    },
    $isValid() {
      return !this.$validate.$error;
    },
    $isDirty() {
      return this.$validate.$dirty;
    },
    $label() {
      return this.$options.title;
    },
    $value() {
      return mapValues(cloneDeep(this.data), (v, k) => this.$getValue(k));
    },
    $relations() {
      return this.$options.relations();
    },
    $view() {
      let view = {name: this.$options.title, fields: []};
      for (const key in this.$data) {
        const field = this.$getField(key);
        if (field.export !== false && this.$data[key] && !isEmpty(this.$data[key]) && !this.$data[key].$isEmpty) {
          view.fields.push(field.type !== 'model' ? {label: field.label, value: this.$value[key]}
          : field.relation === 'hasMany' ? {model: field.model, label: field.model.title, values: this.$data[key].map(vm => [{value: vm.$label, view: vm.$view}])}
          : {model: field.model, label: field.model.title, values: [{value: this.$data[key].$label, view: this.$data[key].$view}]});
        }
      }
      return view;
    },
    $validate() {
      return {
        ...this.$v,
        $touch: () => {
          this.$v.$touch();
          Object.keys(this.$relations).map(key => {
            if (this.$relations[key].type === 'hasMany') {
              this[key].map(vm => vm.$validate.$touch());
            } else {
              this[key].$validate.$reset();
              !this[key].$isClear && this[key].$validate.$touch();
            }
          })
        },
        $reset: () => {
          this.$v.$reset();
          Object.keys(this.$relations).map(key => {
            if (this.$relations[key].type === 'hasMany') {
              this[key].map(vm => vm.$validate.$reset());
            } else {
              this[key].$validate.$reset();
            }
          })
        },
        $flattenParams: this.$v.$flattenParams,
        $error: this.$v.$error ? true : Object.keys(this.$relations).some(key => this.$relations[key].type === 'hasMany'
              ? this[key].some(vm => vm.$validate.$error)
              : !this[key].$isClear && this[key].$validate.$error)
      };
    },
    $jsonData() {
      return mapValues(this.$options.fields(), (v, k) => {
        return v.type === 'model' && v.relation === 'hasMany' ? this.$data[k].map(vm => vm.$jsonData)
            : v.type === 'model' && v.relation === 'hasOne' ? (this.$data[k].$isClear ? {} : this.$data[k].$jsonData)
            : this.$data[k];
      });
    }
  },

  methods: {

    // PUBLIC

    $toJSON() {
      return this.$jsonData;
    },
    async $save() {
      try {
        this.$q.loading.show({message: 'Збереження...'});
        const data = await this.$api.model.save(this.$options.name, this.$jsonData);
        this.$q.notify({color: 'positive', timeout: 2500, message: 'Дані успішно збережно', position: 'top', icon: 'done'});
        return this.$options.assignData(data);
      } catch (err) {
        throw err;
      } finally {
        this.$q.loading.hide();
      }
    },
    async $commit(saveOnCommit) {
      try {
        let data = this.$jsonData;
        if (saveOnCommit === true) {
          data = await this.$save();
          assign(this.$data, mapValues(data, (v, k) => this.__normalizeVm(v, k)));
        }
        this.data = cloneDeep(data);
        this.__clearVm();
        return this;
      } catch (err) {
        console.error(err);
      }
    },
    $reset() {
      this.$validate.$reset();
      assignWith(this.$data, filterId(this.$options.defaults()), (obj, src, key) => {
        const field = this.$getField(key);
        return field.type === 'model' ? (field.relation === 'hasMany' ? src.slice(0) : obj.$reset()) : src;
      });
      return this;
    },
    $rollback() {
      this.$validate.$reset();
      assign(this.$data, mapValues(cloneDeep(this.data), (v, k) => this.__normalizeVm(v, k)));
      this.__clearVm();
      return this;
    },
    $getValue(fieldName) {
      return this.$options.getValue(fieldName, this.data[fieldName]);
    },
    $getField(fieldName) {
      return this.$options.getField(fieldName);
    },

    // PRIVATE

    __clearVm() {
      difference(this.$children, flatten(Object.keys(this.$relations).map(key => this[key])))
          .map(vm => vm.$destroy());
    },
    __normalizeVm(value, key) {
      const field = this.$getField(key);
      return field.type === 'model'
          ? (field.relation === 'hasMany' ? value.map(v => v instanceof Vue ? v : new field.model(v, this)) : value instanceof Vue ? value : new field.model(value, this))
          : cloneDeep(value)
    }
  }

});

export default class DbModel {

  constructor(data, parent) {
    const  {name, title, defaults, fields, validations, defaultValidations, getValue, getField, relations, assignData} = this.constructor;
    return new vm({
      propsData: {data: this.constructor.assignData(data)},
      constructor: this.constructor,
      validations: merge(validations(), defaultValidations(fields)),
      name, title, defaults, fields, getValue, getField, relations, parent, assignData,
      ...this.setup()
    });
  }

  static defaults() {
    return {};
  }

  static fields() {
    return {};
  }

  static validations() {
    return {};
  }

  static assignData(data) {
    return assignWith(this.defaults(), data, (defaultValue, value, key) => {
      const field = this.getField(key);
      return field.type === 'date' ? (field.multiple ? value.map(v => truncDateString(v)) : truncDateString(value))
          : field.type === 'model' ? (field.relation === 'hasMany' ? value.map(v => field.model.assignData(v)) : isEmpty(value) ? {} : field.model.assignData(value))
          : value;
    });
  }

  static defaultValidations(fields) {
    return pickBy(mapValues(fields(), v => {
      return v.type === 'date' ? {date}
      : v.type === 'datetime' ? {date: datetime}
      : v.type === 'number' ? {decimal}
      : v.type === 'model' && v.relation === 'hasMany' ? {isArray}
      : v.type === 'email' ? {email}
      : v.type === 'ipAddress' ? {ipAddress}
      : v.type === 'macAddress' ? {macAddress}
      : false
    }), v => v);
  }

  static relations() {
    return mapValues(pickBy(this.fields(), v => v.type === 'model'), v => ({type: v.relation, model: v.model}));
  }

  static getValue(fieldName, value) {
    const field = this.getField(fieldName);
    return field.type === 'select' ? (field.multiple ? value.map(v => getDictValue(v, field.dict)).join(', ') : getDictValue(value, field.dict))
        : field.type === 'date' ? (field.multiple ? value.map(v => truncDateString(v)).join(', ') : truncDateString(value))
        : field.type === 'boolean' ? (field.multiple ? value.map(v => getDictValue(v ? '1' : '0', 'BOOL')).join(', ') : getDictValue(value ? '1' : '0', 'BOOL'))
        : (field.multiple ? value.join(', ') : value)
  }

  static getField(fieldName) {
    return this.fields()[fieldName] || {};
  }

  // VM

  setup() {
    return {};
  }

  // DB

  static async create(modelData, returnInstance) {
    const data = await API.model.save(this.name, filterId(modelData));
    return returnInstance ? new this(data) : data;
  }

  static async upsert(modelData, returnInstance) {
    const data = await API.model.save(this.name, modelData);
    return returnInstance ? new this(data) : data;
  }

  static async findById(id, returnInstance) {
    const data = await API.model.findById(this.name, id);
    return returnInstance ? new this(data) : data;
  }

  static async findOne(filter, returnInstance) {
    const data = await API.model.findOne(this.name, filter);
    return returnInstance ? new this(data) : data;
  }

  static async find(filter, returnInstances) {
    const data = await API.model.find(this.name, filter);
    return returnInstances ? data.slice(0, 100).map(v => new this(v)) : data;
  }

  static async exists(id) {
    return await API.model.exists(this.name, id);
  }

  static async deleteById(id) {
    return await API.model.deleteById(this.name, id);
  }

  static async deleteByIds(ids) {
    return await API.model.deleteByIds(this.name, ids);
  }

  static async count(where) {
    return await API.model.count(this.name, where);
  }

}
