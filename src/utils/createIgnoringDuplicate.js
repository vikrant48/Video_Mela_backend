// For toggles (like, subscribe): two concurrent requests can both see "not there yet" and both
// insert. The model's unique index rejects the second insert (E11000); that's the desired end
// state anyway, so treat it as success instead of an error.
export const createIgnoringDuplicate = async (model, doc) => {
    try {
        await model.create(doc)
    } catch (error) {
        if (error?.code !== 11000) throw error
    }
}
