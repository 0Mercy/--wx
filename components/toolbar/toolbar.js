Component({
  properties: {
    canUndo: {
      type: Boolean,
      value: false
    },
    canRedo: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onUndo() {
      if (this.properties.canUndo) this.triggerEvent('undo');
    },

    onRedo() {
      if (this.properties.canRedo) this.triggerEvent('redo');
    },

    onRemoveCorner() {
      this.triggerEvent('removeCorner');
    },

    onRemoveTiled() {
      this.triggerEvent('removeTiled');
    },

    onSave() {
      this.triggerEvent('save');
    }
  }
});
