/** @odoo-module **/

import {registerPatch} from "@mail/model/model_core";

registerPatch({
    name: "MessageView",
    recordMethods: {
        onClickGatewayThread(ev) {
            ev.preventDefault();
            const data = this.message.gateway_thread_data;
            if (data && data.model && data.id) {
                this.env.services.action.doAction({
                    type: "ir.actions.act_window",
                    res_model: data.model,
                    res_id: data.id,
                    views: [[false, "form"]],
                    target: "current",
                });
            }
        },
    },
});
