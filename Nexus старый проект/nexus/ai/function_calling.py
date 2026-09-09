class FunctionCalling:
    def execute(self, name, arguments):
        return {
            "function": name,
            "arguments": arguments,
            "status": "completed"
        }
