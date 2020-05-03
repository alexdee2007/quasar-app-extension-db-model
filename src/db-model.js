import Vue from 'vue';
import { Loading, Notify } from 'quasar';
import API from 'db-api';
import { pick, pickBy, mapValues, isEqualWith, cloneDeep, assignWith, assign, merge, flatten, difference, isEmpty, map, get } from 'lodash';
import { decimal, email, ipAddress, macAddress } from 'vuelidate/lib/validators';
import { date, datetime, isArray, getErrorLabel } from 'db-input/utils/validators';
import { filterServiceFields, equalBlank, getDictValue, joinStrings, truncDateString } from './utils';

const vm = Vue.extend({

  props: {
    data: Object
  },

  data() {
    return mapValues(cloneDeep(this.data), (v, k) => this.__normalizeVm(v, k));
  },

  computed: {
    $isChanged() {
      return this.$options.state.active ? !isEqualWith(this.data, this.$jsonData, equalBlank) : false;
    },
    $isEmpty() {
      return this.$options.state.active ? isEqualWith(this.$ownDefaults, this.$ownJsonData, equalBlank) : true;
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
      let fields = [];
      for (const key in this.$options.fields()) {
        const field = this.$getField(key);
        if (field.export !== false) {
          fields.push(
              field.type === 'model' ? (this.$data[key].$isEmpty ? {} : {model: field.model, label: field.model.title, name: key, values: [this.$data[key]]})
              : field.type === 'models' ? (!this.$data[key].length ? {} : {model: field.model, label: field.model.title, name: key, values: this.$data[key]})
              : {label: field.label, value: this.$value[key], name: key}
          )
        }
      }
      return {name: this.$options.title, fields: fields.filter(v => v.value || (v.values && v.values.length))};
    },
    $errors() {
      return Object.keys(this.$validate)
          .filter(key => key.charAt(0) !== "$")
          .filter(key => this.$validate[key].$error)
          .map(key => `${this.$getField(key).label}-${getErrorLabel(this.$validate[key])}`)
          .join();
    },
    $validate() {
      return {
        ...this.$v,
        $touch: () => {
          this.$v.$touch();
          this.$v.$error && console.warn(`Помилка валідації моделі "${this.$options.title}": ${this.$errors}`);
          this.$relations.map(relation => {
            if (relation.type === 'hasMany') {
              this[relation.name].map(vm => vm.$validate.$touch());
            } else {
              (!this[relation.name].$isEmpty || get(this.$validate, `${relation.name}.required`) === false) && this[relation.name].$validate.$touch();
            }
          })
        },
        $reset: () => {
          this.$v.$reset();
          this.$relations.map(relation => {
            if (relation.type === 'hasMany') {
              this[relation.name].map(vm => vm.$validate.$reset());
            } else {
              this[relation.name].$validate.$reset();
            }
          })
        },
        $flattenParams: this.$v.$flattenParams,
        $error: this.$v.$error ? true : this.$relations.some(relation => relation.type === 'hasMany'
              ? this[relation.name].some(vm => vm.$validate.$error)
              : this[relation.name].$validate.$error)
      };
    },
    $jsonData() {
      return mapValues(this.$data, (v, k) => {
        const field = this.$getField(k);
        return field.type === 'model' ? (this.$data[k].$isEmpty ? {} : this.$data[k].$jsonData)
            : field.type === 'models' ? this.$data[k].map(vm => vm.$jsonData)
            : this.$data[k];
      });
    },
    $ownDefaults() {
      return filterServiceFields(this.$options.defaults());
    },
    $ownJsonData() {
      return pick(this.$jsonData, Object.keys(this.$ownDefaults));
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
        this.$emit('save');
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
        this.$children.map(vm => vm.$isChanged && vm.$commit());
        this.$emit('commit');
        return this;
      } catch (err) {
        console.error(err);
      }
    },
    $reset() {
      this.$validate.$reset();
      assign(this.$data, mapValues(this.$ownDefaults, (v, k) => this.__normalizeVm(v, k)));
      this.$emit('reset');
      return this;
    },
    $rollback() {
      this.$validate.$reset();
      assignWith(this.$data, this.data, this.__assignRollback);
      this.__clearVm();
      this.$emit('rollback');
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
      difference(this.$children, flatten(this.$relations.map(relation => this[relation.name])))
          .map(vm => vm.$destroy());
    },
    __normalizeVm(value, key) {
      const field = this.$getField(key);
      return field.type === 'model' ? (value instanceof Vue ? value : new field.model(value, this))
          : field.type === 'models' ? value.map(v => v instanceof Vue ? v : new field.model(v, this))
          : cloneDeep(value)
    },
    __assignRollback(obj, src, key) {
      const field = this.$getField(key);
      return field.type === 'model' ? (obj instanceof Vue && isEqualWith(obj.$jsonData, src, equalBlank) ? obj : new field.model(src, this))
          : field.type === 'models' ? src.map((v, k) => obj[k] instanceof Vue && isEqualWith(obj[k].$jsonData, v, equalBlank) ? obj[k] : new field.model(v, this))
          : cloneDeep(src);
    }
  }

});

export default class DbModel {

  constructor(data, parent) {
    const  {name, title, defaults, fields, validations, defaultValidations, getValue, getField, relations, assignData} = this.constructor;
    return new vm({
      propsData: {data: Object.freeze(this.constructor.assignData(data))},
      constructor: this.constructor,
      validations: merge(validations(), defaultValidations(fields)),
      name, title, defaults, fields, getValue, getField, relations, parent, assignData,
      state: Vue.observable({active: true}),
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
          : field.type === 'model' ? (isEmpty(value) ? {} : field.model.assignData(value))
          : field.type === 'models' ? value.map(v => field.model.assignData(v))
          : value;
    });
  }

  static defaultValidations(fields) {
    return pickBy(mapValues(fields(), v => {
      return v.type === 'date' ? {date}
      : v.type === 'datetime' ? {date: datetime}
      : v.type === 'number' ? {decimal}
      : v.type === 'models' ? {isArray}
      : v.type === 'email' ? {email}
      : v.type === 'ipAddress' ? {ipAddress}
      : v.type === 'macAddress' ? {macAddress}
      : false
    }), v => v);
  }

  static relations() {
    return map(pickBy(this.fields(), v => ['model', 'models'].indexOf(v.type) !== -1),
        (v, k) => ({type: v.type === 'model' ? 'hasOne' : 'hasMany', model: v.model, name: k, label: v.label, filter: v.filter, sort: v.sort, export: v.export}));
  }

  static getValue(fieldName, value) {
    const field = this.getField(fieldName);
    return value === null || value === '' ? value
        : field.type === 'select' ? (field.multiple ? value.map(v => getDictValue(v, field.dict)).join(', ') : getDictValue(value, field.dict))
        : field.type === 'date' ? (field.multiple ? value.map(v => truncDateString(v)).join(', ') : truncDateString(value))
        : field.type === 'boolean' ? (field.multiple ? value.map(v => getDictValue(v ? '1' : '0', 'BOOL')).join(', ') : getDictValue(value ? '1' : '0', 'BOOL'))
        : (field.multiple ? value.join(', ') : value)
  }

  static getField(fieldName) {
    return get(this.fields(), fieldName, {});
  }

  // VM

  setup() {
    return {};
  }

  // DB

  static async create(modelData) {
    try {
      Loading.show({message: 'Створення...'});
      const data = await API.model.save(this.name, filterServiceFields(modelData));
      Notify.create({color: 'positive', timeout: 2500, message: 'Запис успішно створено', position: 'top', icon: 'done'});
      return new this(data);
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async upsert(modelData) {
    try {
      Loading.show({message: 'Збереження...'});
      const data = await API.model.save(this.name, modelData);
      Notify.create({color: 'positive', timeout: 2500, message: 'Дані успішно збережно', position: 'top', icon: 'done'});
      return new this(data);
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async findById(id) {
    try {
      Loading.show({message: 'Завантаження...'});
      const data = await API.model.findById(this.name, id);
      return new this(data);
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async findOne(filter) {
    try {
      Loading.show({message: 'Завантаження...'});
      const data = await API.model.findOne(this.name, filter);
      return new this(data);
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async find(filter) {
    try {
      Loading.show({message: 'Завантаження...'});
      const data = await API.model.find(this.name, filter);
      return data.slice(0, 100).map(v => new this(v)); // limit 100 instances
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async exists(id) {
    try {
      Loading.show({message: 'Перевірка...'});
      return await API.model.exists(this.name, id);
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async deleteById(id) {
    try {
      Loading.show({message: 'Видалення...'});
      const data = await API.model.deleteById(this.name, id);
      Notify.create({color: 'positive', timeout: 2500, message: 'Дані успішно видалено', position: 'top', icon: 'done'});
      return data;
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

  static async count(where) {
    try {
      Loading.show({message: 'Підрахунок...'});
      return await API.model.count(this.name, where);
    } catch (err) {
      throw err;
    } finally {
      Loading.hide();
    }
  }

}
