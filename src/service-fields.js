export const fields = {
  id: {
    type: 'number',
    label: 'Ідентифікатор',
    export: false
  },
  insertUsername: {
    type: 'text',
    upperCase: false,
    label: 'Хто ввів інформацію'
  },
  insertDate: {
    type: 'datetime',
    label: 'Дата вводу'
  },
  updateUsername: {
    type: 'text',
    upperCase: false,
    label: 'Хто корегував інформацію'
  },
  updateDate: {
    type: 'datetime',
    label: 'Дата коригування'
  },
  deleteUsername: {
    type: 'text',
    upperCase: false,
    label: 'Хто видалив інформацію',
    filter: false,
    sort: false,
    export: false
  },
  deleteDate: {
    type: 'datetime',
    label: 'Дата видалення',
    filter: false,
    sort: false,
    export: false
  }
}

export const defaults = {
  id: null,
  insertUsername: null,
  insertDate: null,
  updateUsername: null,
  updateDate: null,
  deleteUsername: null,
  deleteDate: null
}
