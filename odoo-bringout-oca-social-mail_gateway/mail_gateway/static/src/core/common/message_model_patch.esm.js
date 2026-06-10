import {Message} from "@mail/core/common/message_model";
import {patch} from "@web/core/utils/patch";
// stateToUrl is NOT a named export of the router module — only a method on
// the exported `router` object (true on both the May-2026 core and current
// OCB 19.0); a bare named import is silently undefined and throws at call.
import {router} from "@web/core/browser/router";
import {url} from "@web/core/utils/urls";

patch(Message.prototype, {
    setup() {
        super.setup(...arguments);
        this.gateway_thread_data = null;
    },
    get resUrl() {
        // the server sends false or {} for non-gateway messages — only
        // divert when there is an actual linked record.
        if (!this.gateway_thread_data?.model) {
            return super.resUrl;
        }
        return url(
            router.stateToUrl({
                model: this.gateway_thread_data.model,
                resId: this.gateway_thread_data.id,
            })
        );
    },
    get editable() {
        return super.editable && !this.gateway_type;
    },
});
